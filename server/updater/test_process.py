import io
import json
import subprocess
from unittest.mock import Mock, patch

import kroma_updater as updater
from test_support import request, UpdaterCase


class ProcessTests(UpdaterCase):
    def test_an_idle_host_writes_no_operation(self):
        updater.process(self.config)
        self.assertFalse((self.state / 'operation.json').exists())

    def test_another_request_cannot_displace_an_interrupted_operation(self):
        updater.write_json(self.bridge / 'request.json', request())
        previous = request()
        previous.update(id='b' * 64, phase='installing')
        updater.write_json(self.state / 'operation.json', previous)
        with self.assertRaisesRegex(ValueError, 'interrupted operation'):
            updater.process(self.config)
        self.assertFalse((self.bridge / 'result.json').exists())

    def test_host_command_output_is_never_shared_with_the_server(self):
        updater.write_json(self.bridge / 'request.json', request())
        error = subprocess.CalledProcessError(1, ['installer'], stderr='secret-host-token')
        with patch.object(updater, 'fetch_json', return_value={'instanceId': 'server'}), \
                patch.object(updater, 'release_for', return_value=[]), \
                patch.object(updater, 'docker_update', side_effect=error), \
                patch('sys.stdout', new=io.StringIO()) as log:
            updater.process(self.config)
        result = updater.read_json(self.bridge / 'result.json')
        self.assertEqual(result['phase'], 'failed')
        self.assertNotIn('secret-host-token', json.dumps(result))
        self.assertIn('secret-host-token', log.getvalue())

    def test_automatic_docker_installation_checks_idle_at_the_apply_boundary(self):
        asked = request()
        asked['automatic'] = True
        updater.write_json(self.bridge / 'request.json', asked)
        phases = []

        def apply(config, target, before_apply):
            phases.append(updater.read_json(self.bridge / 'result.json')['phase'])
            before_apply()
            phases.append(updater.read_json(self.bridge / 'result.json')['phase'])

        def idle(config):
            phases.append(updater.read_json(self.bridge / 'result.json')['phase'])

        with patch.object(updater, 'fetch_json', return_value={'instanceId': 'server'}), \
                patch.object(updater, 'release_for', return_value=[]), \
                patch.object(updater, 'docker_update', side_effect=apply), \
                patch.object(updater, 'wait_until_idle', side_effect=idle), \
                patch.object(updater, 'wait_for_build') as wait:
            updater.process(self.config)
        self.assertEqual(phases, ['preparing', 'waiting_idle', 'installing'])
        wait.assert_called_once_with(self.config, asked['target'], 'server')
        self.assertEqual(updater.read_json(self.bridge / 'result.json')['phase'], 'complete')

    def test_synology_dispatch_preserves_the_reviewed_assets(self):
        self.config['platform'] = 'synology'
        asked = request()
        updater.write_json(self.bridge / 'request.json', asked)
        assets = [{'name': 'reviewed.spk'}]
        with patch.object(updater, 'fetch_json', return_value={'instanceId': 'server'}), \
                patch.object(updater, 'release_for', return_value=assets), \
                patch.object(updater, 'synology_update') as install, \
                patch.object(updater, 'wait_for_build'):
            updater.process(self.config)
        self.assertEqual(install.call_args.args[:3], (self.config, asked['target'], assets))

    def test_health_retries_outages_and_requires_the_exact_running_build(self):
        target = request()['target']
        healthy = {'status': 'ok', 'instanceId': 'server', **target}
        with patch.object(updater.time, 'sleep') as sleep, \
                patch.object(updater, 'fetch_json', side_effect=[OSError('restarting'), healthy]):
            updater.wait_for_build(self.config, target, 'server')
        sleep.assert_called_once_with(2)

    def test_heartbeat_advertises_only_the_protocol_platform_and_freshness(self):
        stop = Mock()
        stop.is_set.side_effect = [False, True]
        with patch.object(updater.time, 'time', return_value=12345):
            updater.heartbeat(self.config, stop)
        self.assertEqual(updater.read_json(self.bridge / 'heartbeat.json'),
                         {'protocol': 1, 'platform': 'docker', 'timestamp': 12345})
        stop.wait.assert_called_once_with(15)

    def test_a_bad_request_is_logged_and_does_not_stop_the_service(self):
        with patch.object(updater.threading, 'Thread') as thread, \
                patch.object(updater, 'process', side_effect=ValueError('Invalid request')), \
                patch('sys.stdout', new=io.StringIO()) as log:
            updater.serve(self.config, True)
        self.assertIn('Invalid request', log.getvalue())
        thread.return_value.join.assert_called_once_with()

    def test_continuous_service_waits_between_requests_and_stops_heartbeat_on_exit(self):
        with patch.object(updater.threading, 'Thread') as thread, \
                patch.object(updater.threading, 'Event') as event, \
                patch.object(updater, 'process', side_effect=[None, KeyboardInterrupt]), \
                self.assertRaises(KeyboardInterrupt):
            updater.serve(self.config, False)
        event.return_value.wait.assert_called_once_with(2)
        event.return_value.set.assert_called_once_with()
        thread.return_value.join.assert_called_once_with()
