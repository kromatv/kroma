import io
import os
import runpy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import kroma_updater as updater
from test_support import UpdaterCase


class ConfigurationTests(UpdaterCase):
    def load(self):
        path = self.root / 'updater.json'
        updater.write_json(path, self.config)
        return updater.load_config(path)

    def test_host_configuration_loads_from_an_absolute_path(self):
        self.assertEqual(self.load(), self.config)

    def test_relative_configuration_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'absolute'):
            updater.load_config('updater.json')

    def test_platform_requirements_are_enforced(self):
        for platform, missing in [('docker', 'service'), ('synology', 'arch'), ('binary', 'command')]:
            self.config['platform'] = platform
            self.config.pop(missing, None)
            with self.assertRaisesRegex(ValueError, missing):
                self.load()

    def test_unknown_platform_is_rejected(self):
        self.config['platform'] = 'shell'
        with self.assertRaisesRegex(ValueError, 'Unsupported platform'):
            self.load()

    def test_native_commands_cannot_be_shell_strings_or_nonstring_arguments(self):
        self.config['platform'] = 'binary'
        for command in ('restart; reboot', ['restart', 42], []):
            self.config['command'] = command
            with self.assertRaises(ValueError):
                self.load()
        self.config['command'] = ['/opt/install-kroma']
        self.assertEqual(self.load()['command'], ['/opt/install-kroma'])

    def test_bridge_and_state_must_be_absolute_and_separate(self):
        original = self.config.copy()
        for key in ('bridge_dir', 'state_dir'):
            self.config = {**original, key: 'relative'}
            with self.assertRaisesRegex(ValueError, 'absolute'):
                self.load()
        for state in (self.bridge, self.bridge / 'state'):
            self.config = {**original, 'state_dir': str(state)}
            with self.assertRaisesRegex(ValueError, 'outside the shared bridge'):
                self.load()

    def test_server_writable_configuration_is_rejected(self):
        path = self.bridge / 'updater.json'
        updater.write_json(path, self.config)
        with self.assertRaisesRegex(ValueError, 'config must be outside'):
            updater.load_config(path)

    def test_aliasing_the_bridge_through_a_symlink_is_rejected(self):
        alias = self.root / 'alias'
        alias.symlink_to(self.bridge, target_is_directory=True)
        self.config['state_dir'] = str(alias / 'state')
        with self.assertRaisesRegex(ValueError, 'outside the shared bridge'):
            self.load()

    def test_a_second_posix_updater_cannot_hold_the_same_lock(self):
        if os.name == 'nt':
            self.skipTest('POSIX locking')
        with updater.lock_state(self.state), self.assertRaises(OSError):
            updater.lock_state(self.state)
        with updater.lock_state(self.state) as lock:
            self.assertFalse(lock.closed)

    def test_windows_lock_reserves_one_byte_in_the_private_state_directory(self):
        locking = Mock()
        msvcrt = SimpleNamespace(locking=locking, LK_NBLCK=1)
        with patch.dict('sys.modules', msvcrt=msvcrt), patch.object(updater.os, 'name', 'nt'), \
                updater.lock_state(self.state) as lock:
            self.assertFalse(lock.closed)
        self.assertEqual((self.state / 'lock').read_text(), '0')
        self.assertEqual(locking.call_args.args[1:], (1, 1))

    def test_cli_reports_invalid_configuration_without_starting_the_service(self):
        with patch('sys.stderr', new=io.StringIO()), self.assertRaises(SystemExit) as error:
            updater.main(['--config', 'relative'])
        self.assertEqual(error.exception.code, 2)

    def test_cli_once_runs_and_closes_the_operator_lock(self):
        path = self.root / 'updater.json'
        updater.write_json(path, self.config)
        with patch.object(updater, 'serve') as serve:
            updater.main(['--config', str(path), '--once'])
        serve.assert_called_once_with(self.config, True)

    def test_script_entry_point_can_run_once_with_no_pending_request(self):
        path = self.root / 'updater.json'
        updater.write_json(path, self.config)
        script = str(Path(updater.__file__))
        with patch('sys.argv', [script, '--config', str(path), '--once']):
            runpy.run_path(script, run_name='__main__')
        self.assertTrue((self.state / 'lock').exists())
