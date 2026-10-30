import io
import os
from types import SimpleNamespace
from unittest.mock import patch

import kroma_updater as updater
from test_support import request, UpdaterCase


class BridgeTests(UpdaterCase):
    def test_oversized_and_malformed_json_is_rejected(self):
        path = self.bridge / 'request.json'
        for content in (' ' * 65537, '{'):
            path.write_text(content)
            with self.assertRaises(ValueError):
                updater.read_json(path)

    def test_failed_serialization_preserves_the_previous_file_and_cleans_up(self):
        path = self.bridge / 'result.json'
        updater.write_json(path, {'phase': 'queued'})
        with patch.object(updater.json, 'dump', side_effect=OSError('Disk full')), \
                self.assertRaises(OSError):
            updater.write_json(path, {'phase': 'complete'})
        self.assertEqual(updater.read_json(path), {'phase': 'queued'})
        self.assertEqual(list(self.bridge.glob('.updater-*')), [])

    def test_shared_results_are_group_readable_and_journals_remain_private(self):
        private, shared = self.state / 'operation.json', self.bridge / 'result.json'
        updater.write_json(private, request())
        updater.write_json(shared, request(), shared=True)
        if os.name != 'nt':
            self.assertEqual(private.stat().st_mode & 0o777, 0o600)
            self.assertEqual(shared.stat().st_mode & 0o777, 0o640)

    def test_replacing_a_shared_symlink_never_changes_its_target(self):
        target = self.root / 'private.json'
        target.write_text('private')
        link = self.bridge / 'result.json'
        link.symlink_to(target)
        updater.write_json(link, {'phase': 'complete'}, shared=True)
        self.assertFalse(link.is_symlink())
        self.assertEqual(target.read_text(), 'private')

    def test_fetches_are_bounded_and_identify_the_updater(self):
        response = io.BytesIO(b'{"status":"ok"}')
        with patch.object(updater.urllib.request, 'urlopen', return_value=response) as open_url:
            self.assertEqual(updater.fetch_json(self.config['health_url']), {'status': 'ok'})
        req = open_url.call_args.args[0]
        self.assertEqual(req.get_header('User-agent'), 'KROMA-Updater/1')
        self.assertEqual(open_url.call_args.kwargs['timeout'], 20)

    def test_commands_are_bounded_argument_arrays_without_a_shell(self):
        with patch.object(updater.subprocess, 'run', return_value=SimpleNamespace(stdout='done\n')) as run:
            self.assertEqual(updater.run(['installer', '--restart'], input='{}'), 'done')
        run.assert_called_once_with(['installer', '--restart'], check=True, timeout=900,
                                    capture_output=True, text=True, input='{}')

    def test_invalid_identity_is_rejected(self):
        asked = request()
        asked['id'] = '../operation'
        with self.assertRaisesRegex(ValueError, 'identity'):
            updater.validate(asked)

    def test_release_assets_must_match_the_exact_build(self):
        target = request()['target']
        assets = [{'name': 'kroma-0.1.42.3600000-x86_64.spk'},
                  {'name': 'kroma-0.1.42.3600001-x86_64.spk'},
                  {'name': 'kroma-0.1.42.3600000-x86_64.spk.info.json'}]
        with patch.object(updater, 'fetch_json', return_value={'assets': assets}) as fetch:
            self.assertEqual(updater.release_for(target), assets[:1])
        self.assertTrue(fetch.call_args.args[0].endswith('/tags/canary'))
        target['channel'] = 'Stable'
        with patch.object(updater, 'fetch_json', return_value={'assets': assets}) as fetch:
            updater.release_for(target)
        self.assertTrue(fetch.call_args.args[0].endswith('/tags/v0.1.42'))

    def test_unpublished_releases_and_missing_builds_are_rejected(self):
        target = request()['target']
        target['channel'] = 'Stable'
        for release in ({'draft': True}, {'prerelease': True}, {'assets': []}):
            with patch.object(updater, 'fetch_json', return_value=release), \
                    self.assertRaises(ValueError):
                updater.release_for(target)
