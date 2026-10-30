import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import kroma_updater as updater


def request():
    return {'id': 'a' * 64, 'target': {'channel': 'Canary', 'version': '0.1.42', 'build': 3600000},
            'phase': 'queued', 'message': None, 'requestedAt': '2026-10-29T12:00:00Z'}


class UpdaterTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        root = Path(self.scratch.name)
        (root / 'bridge').mkdir()
        (root / 'state').mkdir()
        self.config = {'bridge_dir': str(root / 'bridge'), 'state_dir': str(root / 'state'),
                       'platform': 'docker', 'health_url': 'http://localhost:4040/api/health',
                       'project': 'kroma', 'service': 'kroma', 'compose_files': ['/opt/kroma/compose.yml']}

    def test_untrusted_request_cannot_supply_a_command_or_image_tag(self):
        for key, value in [('version', '0.1.42; reboot'), ('build', True), ('channel', 'latest')]:
            asked = request()
            asked['target'][key] = value
            with self.assertRaises(ValueError):
                updater.validate(asked)

    def test_docker_pins_digest_and_preserves_other_services(self):
        digest = updater.IMAGE + '@sha256:' + 'b' * 64
        info = [{'Config': {'Labels': {'org.kroma.package-version': '0.1.42.3600000'}},
                 'RepoDigests': [digest]}]
        with patch.object(updater, 'run', side_effect=['', json.dumps(info), '']) as run:
            updater.docker_update(self.config, request()['target'])
        self.assertEqual(run.call_args_list[0].args[0], ['docker', 'pull', updater.IMAGE + ':0.1.42.3600000'])
        command = run.call_args.args[0]
        self.assertIn('--no-deps', command)
        self.assertEqual(command[-1], 'kroma')
        override = updater.read_json(Path(self.config['state_dir']) / 'image.compose.json')
        self.assertEqual(override['services']['kroma']['image'], digest)

    def test_wrong_docker_payload_never_recreates_the_service(self):
        with patch.object(updater, 'run', side_effect=['', json.dumps([{'Config': {'Labels': {}}}])]) as run:
            with self.assertRaisesRegex(ValueError, 'reviewed server build'):
                updater.docker_update(self.config, request()['target'])
        self.assertEqual(run.call_count, 2)

    def test_a_missing_build_never_reaches_the_platform_adapter(self):
        updater.write_json(Path(self.config['bridge_dir']) / 'request.json', request())
        with patch.object(updater, 'fetch_json', return_value={'instanceId': 'server-one'}), \
                patch.object(updater, 'release_for', side_effect=ValueError('Build removed')), \
                patch.object(updater, 'docker_update') as install:
            updater.process(self.config)
        install.assert_not_called()
        result = updater.read_json(Path(self.config['bridge_dir']) / 'result.json')
        self.assertEqual(result['phase'], 'failed')
        self.assertEqual(result['message'], 'Build removed')

    def test_an_interrupted_install_reconciles_without_running_again(self):
        asked = request()
        updater.write_json(Path(self.config['bridge_dir']) / 'request.json', asked)
        asked.update(phase='installing', instanceId='server-one')
        updater.write_json(Path(self.config['state_dir']) / 'operation.json', asked)
        with patch.object(updater, 'wait_for_build') as wait, patch.object(updater, 'docker_update') as install:
            updater.process(self.config)
            updater.process(self.config)
        install.assert_not_called()
        wait.assert_called_once_with(self.config, asked['target'], 'server-one')
        self.assertEqual(updater.read_json(Path(self.config['bridge_dir']) / 'result.json')['phase'], 'complete')

    def test_synology_refuses_a_package_with_a_bad_checksum(self):
        self.config['arch'] = 'x86_64'
        asset = {'name': 'kroma-0.1.42.3600000-x86_64.spk',
                 'digest': 'sha256:' + hashlib.sha256(b'correct').hexdigest(),
                 'browser_download_url': 'https://github.com/kromatv/kroma/releases/download/canary/kroma.spk'}
        with patch.object(updater.urllib.request, 'urlopen', return_value=io.BytesIO(b'tampered')), \
                patch.object(updater, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                updater.synology_update(self.config, request()['target'], [asset])
        run.assert_not_called()

    def test_synology_hands_only_a_verified_package_to_dsm(self):
        self.config['arch'] = 'x86_64'
        asset = {'name': 'kroma-0.1.42.3600000-x86_64.spk',
                 'digest': 'sha256:' + hashlib.sha256(b'correct').hexdigest(),
                 'browser_download_url': 'https://github.com/kromatv/kroma/releases/download/canary/kroma.spk'}
        with patch.object(updater.urllib.request, 'urlopen', return_value=io.BytesIO(b'correct')), \
                patch.object(updater, 'run') as run:
            updater.synology_update(self.config, request()['target'], [asset])
        self.assertEqual(run.call_args_list[0].args[0][:2], ['/usr/syno/bin/synopkg', 'install'])
        self.assertEqual(run.call_args_list[1].args[0], ['/usr/syno/bin/synopkg', 'start', 'kroma'])

    def test_native_adapter_receives_reviewed_json_without_a_shell(self):
        self.config.update(platform='binary', command=['/opt/kroma/install', '--restart'])
        updater.write_json(Path(self.config['bridge_dir']) / 'request.json', request())
        with patch.object(updater, 'fetch_json', return_value={'instanceId': 'server-one'}), \
                patch.object(updater, 'release_for', return_value=[{}]), \
                patch.object(updater, 'wait_for_build'), patch.object(updater, 'run') as run:
            updater.process(self.config)
        self.assertEqual(run.call_args.args[0], ['/opt/kroma/install', '--restart'])
        self.assertEqual(json.loads(run.call_args.kwargs['input'])['target'], request()['target'])
        self.assertEqual(updater.read_json(Path(self.config['bridge_dir']) / 'result.json')['phase'], 'complete')

    def test_host_health_must_match_build_and_server_identity(self):
        health = {'status': 'ok', 'instanceId': 'other-server', 'version': '0.1.42', 'build': 3600000}
        with patch.object(updater, 'fetch_json', return_value=health), \
                patch.object(updater.time, 'monotonic', side_effect=[0, 1, 301]), \
                patch.object(updater.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'did not become healthy'):
                updater.wait_for_build(self.config, request()['target'], 'server-one')

    def test_symlinks_are_not_followed_when_reading_a_request(self):
        root = Path(self.scratch.name)
        target = root / 'file.json'
        target.write_text('{}')
        link = root / 'link.json'
        link.symlink_to(target)
        with self.assertRaises(ValueError):
            updater.read_json(link)

    def test_automatic_updates_wait_until_playback_stops(self):
        with patch.object(updater, 'fetch_json', side_effect=[
            {'autoInstallUpdates': True, 'activeStreams': 1},
            {'autoInstallUpdates': True, 'activeStreams': 0},
        ]), patch.object(updater.time, 'sleep') as sleep:
            updater.wait_until_idle(self.config)
        sleep.assert_called_once_with(10)

    def test_turning_automatic_updates_off_cancels_before_restart(self):
        with patch.object(updater, 'fetch_json', return_value={'autoInstallUpdates': False, 'activeStreams': 0}):
            with self.assertRaisesRegex(ValueError, 'turned off'):
                updater.wait_until_idle(self.config)

    def test_docker_waits_for_idle_after_pull_but_before_replacing_service(self):
        info = [{'Config': {'Labels': {'org.kroma.package-version': '0.1.42.3600000'}},
                 'RepoDigests': [updater.IMAGE + '@sha256:' + 'b' * 64]}]
        with patch.object(updater, 'run', side_effect=['', json.dumps(info), '']) as run:
            def before_apply():
                self.assertEqual(run.call_count, 2)
                raise ValueError('Still watching')
            with self.assertRaisesRegex(ValueError, 'Still watching'):
                updater.docker_update(self.config, request()['target'], before_apply)
        self.assertEqual(run.call_count, 2)


if __name__ == '__main__':
    unittest.main()
