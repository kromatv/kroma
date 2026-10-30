#!/usr/bin/env python3
"""Operator-supervised update bridge. Python 3.9+, standard library only.

The config and state directory belong to the host operator. The bridge is a
private shared directory, writable by KROMA. Never put config/state inside it.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time
import urllib.request

RELEASES = 'https://api.github.com/repos/kromatv/kroma/releases'
IMAGE = 'ghcr.io/kromatv/kroma'
ACTIVE = {'queued', 'preparing', 'waiting_idle', 'installing', 'restarting'}


def wait_until_idle(config):
    """Recheck after the download, immediately before replacing the service.

    Health must be reached over the LAN/loopback, where it exposes the two
    fields. A missing field never counts as permission to restart unattended.
    """
    while True:
        health = fetch_json(config['health_url'])
        if health.get('autoInstallUpdates') is not True:
            raise ValueError('Automatic installation was turned off. No changes were applied.')
        if health.get('activeStreams') == 0:
            return
        time.sleep(10)


def read_json(path):
    if path.is_symlink():
        raise ValueError('Symlinks are not allowed')
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'rb') as stream:
        content = stream.read(65537)
        if len(content) > 65536:
            raise ValueError('JSON document exceeds 64 KiB')
        return json.loads(content)


def write_json(path, value):
    # Unique, exclusive temporary files prevent symlink substitution in bridge.
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.updater-')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def fetch_json(url):
    request = urllib.request.Request(url, headers={
        'User-Agent': 'KROMA-Updater/1', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read(4 * 1024 * 1024))


def validate(request):
    if not re.fullmatch(r'[a-f0-9]{64}', request['id']):
        raise ValueError('Invalid request identity')
    target = request['target']
    if target['channel'] not in ('Stable', 'Canary'):
        raise ValueError('Invalid channel')
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', target['version']):
        raise ValueError('Invalid version')
    if type(target['build']) is not int or not 0 < target['build'] < 10**12:
        raise ValueError('Invalid build')
    return target


def run(command, **kwargs):
    # All executable names and flags come from host config or constants.
    # Never run a shell or interpolate a command from the shared directory.
    return subprocess.run(command, check=True, timeout=900, capture_output=True,
                          text=True, **kwargs).stdout.strip()


def release_for(target):
    tag = 'canary' if target['channel'] == 'Canary' else 'v' + target['version']
    release = fetch_json(RELEASES + '/tags/' + tag)
    if release.get('draft') or (target['channel'] == 'Stable' and release.get('prerelease')):
        raise ValueError('Release is not published on the selected channel')
    prefix = 'kroma-' + target['version'] + '.' + str(target['build']) + '-'
    assets = [a for a in release['assets'] if a['name'].startswith(prefix)
              and a['name'].endswith('.spk')]
    if not assets:
        raise ValueError('The reviewed server build is no longer published')
    return assets


def docker_update(config, target, before_apply=lambda: None):
    # Version+build tags are published from the very same payload as the SPK.
    image = IMAGE + ':' + target['version'] + '.' + str(target['build'])
    run(['docker', 'pull', image])
    info = json.loads(run(['docker', 'image', 'inspect', image]))[0]
    if info['Config'].get('Labels', {}).get('org.kroma.package-version') != image.split(':')[-1]:
        raise ValueError('Image does not identify the reviewed server build')
    digest = next((d for d in info['RepoDigests'] if d.startswith(IMAGE + '@sha256:')), None)
    if not digest:
        raise ValueError('The image has no registry digest')
    before_apply()
    override = Path(config['state_dir']) / 'image.compose.json'
    write_json(override, {'services': {config['service']: {'image': digest}}})
    command = ['docker', 'compose', '--project-name', config['project']]
    for file in config['compose_files']:
        command += ['-f', file]
    command += ['-f', str(override), 'up', '-d', '--no-deps', '--no-build',
                '--pull', 'never', config['service']]
    run(command)


def synology_update(config, target, assets, before_apply=lambda: None):
    name = 'kroma-' + target['version'] + '.' + str(target['build']) + '-' + config['arch'] + '.spk'
    asset = next((a for a in assets if a['name'] == name), None)
    if not asset:
        raise ValueError('No package for this Synology architecture')
    digest = asset.get('digest', '')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
        raise ValueError('The package has no published SHA-256 digest')
    url = asset['browser_download_url']
    if not url.startswith('https://github.com/kromatv/kroma/releases/download/'):
        raise ValueError('Untrusted package URL')
    # Downloads live outside the bridge so the server cannot replace the SPK.
    with tempfile.TemporaryDirectory(dir=config['state_dir']) as directory:
        package = Path(directory) / 'kroma.spk'
        sha = hashlib.sha256()
        with urllib.request.urlopen(url, timeout=60) as response, package.open('wb') as out:
            size = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > 2 * 1024**3:
                    raise ValueError('Package exceeds 2 GiB limit')
                sha.update(chunk)
                out.write(chunk)
        if sha.hexdigest() != digest[7:]:
            raise ValueError('Package checksum mismatch')
        before_apply()
        run(['/usr/syno/bin/synopkg', 'install', str(package)])
        run(['/usr/syno/bin/synopkg', 'start', 'kroma'])


def wait_for_build(config, target, instance):
    deadline = time.monotonic() + config.get('health_timeout', 300)
    while time.monotonic() < deadline:
        try:
            health = fetch_json(config['health_url'])
            if (health.get('status') == 'ok' and health.get('instanceId') == instance
                    and health.get('version') == target['version']
                    and health.get('build') == target['build']):
                return
        except (OSError, ValueError):
            pass
        time.sleep(2)
    raise RuntimeError('The selected build did not become healthy. Inspect the host updater log; restore the backup if needed.')


def process(config):
    bridge, state = Path(config['bridge_dir']), Path(config['state_dir'])
    path = bridge / 'request.json'
    if not path.exists():
        return
    request = read_json(path)
    target = validate(request)
    journal = state / 'operation.json'
    previous = read_json(journal) if journal.exists() else None
    if previous and previous['id'] == request['id']:
        if previous['phase'] not in ACTIVE:
            write_json(bridge / 'result.json', previous)
            return
        # Never replay an interrupted privileged install. Reconcile its health.
        request = previous
        target = validate(request)
    elif previous and previous['phase'] in ACTIVE:
        raise ValueError('Reconcile the interrupted operation before accepting another request')
    def report(phase, message=None):
        request.update(phase=phase, message=message)
        write_json(journal, request)
        write_json(bridge / 'result.json', request)
    try:
        if previous and previous['id'] == request['id']:
            wait_for_build(config, target, previous.get('instanceId'))
        else:
            health = fetch_json(config['health_url'])
            request['instanceId'] = health['instanceId']
            report('preparing')
            assets = release_for(target)
            def before_apply():
                if request.get('automatic'):
                    report('waiting_idle')
                    wait_until_idle(config)
                report('installing')
            if config['platform'] == 'docker':
                docker_update(config, target, before_apply)
            elif config['platform'] == 'synology':
                synology_update(config, target, assets, before_apply)
            else:
                before_apply()
                run(config['command'], input=json.dumps(request))
            report('restarting')
            wait_for_build(config, target, request['instanceId'])
        report('complete')
    except Exception as error:
        if isinstance(error, subprocess.CalledProcessError):
            print('Host command failed:', error.cmd[0], error.stderr, flush=True)
        # Commands may print private environment/config; never return stderr.
        message = ('The host update command failed. Inspect the updater service log.'
                   if isinstance(error, subprocess.SubprocessError) else str(error))
        report('failed', message[:500])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--once', action='store_true', help='Process once, for DSM Task Scheduler')
    args = parser.parse_args()
    config = read_json(Path(args.config))
    if config['platform'] not in ('docker', 'synology', 'binary', 'unknown'):
        parser.error('Unsupported platform')
    required = {'docker': ('project', 'service', 'compose_files'),
                'synology': ('arch',), 'binary': ('command',), 'unknown': ('command',)}
    for key in ('bridge_dir', 'state_dir', 'health_url') + required[config['platform']]:
        if not config.get(key):
            parser.error('Missing updater configuration: ' + key)
    if config['platform'] in ('binary', 'unknown') and (
            not isinstance(config['command'], list)
            or not all(isinstance(arg, str) for arg in config['command'])):
        parser.error('command must be a nonempty argument array')
    for key in ('bridge_dir', 'state_dir'):
        if not Path(config[key]).is_absolute():
            parser.error(key + ' must be an absolute path')
    state, bridge = Path(config['state_dir']).resolve(), Path(config['bridge_dir']).resolve()
    if state == bridge or bridge in state.parents:
        parser.error('state_dir must be outside the shared bridge')
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    bridge.mkdir(parents=True, exist_ok=True, mode=0o770)
    # Lock in the operator-owned directory; concurrent schedulers must not apply
    # the same request twice. POSIX hosts use flock; Windows uses msvcrt.
    lock = (state / 'lock').open('a+')
    if os.name == 'nt':
        import msvcrt
        lock.write('0')
        lock.flush()
        lock.seek(0)
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    stop = threading.Event()
    def heartbeat():
        while not stop.is_set():
            write_json(bridge / 'heartbeat.json', {'protocol': 1, 'platform': config['platform'],
                                                  'timestamp': int(time.time())})
            stop.wait(15)
    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    try:
        while True:
            try:
                process(config)
            except (OSError, ValueError, KeyError) as error:
                print('Invalid update request:', error, flush=True)
            if args.once:
                break
            stop.wait(2)
    finally:
        stop.set()
        thread.join()


if __name__ == '__main__':
    main()
