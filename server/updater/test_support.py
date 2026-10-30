from pathlib import Path
import tempfile
import unittest


def request():
    return {'id': 'a' * 64, 'target': {'channel': 'Canary', 'version': '0.1.42', 'build': 3600000},
            'phase': 'queued', 'message': None, 'requestedAt': '2026-10-29T12:00:00Z'}


class UpdaterCase(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.bridge = self.root / 'bridge'
        self.state = self.root / 'state'
        self.bridge.mkdir()
        self.state.mkdir()
        self.config = {'bridge_dir': str(self.bridge), 'state_dir': str(self.state),
                       'platform': 'docker', 'health_url': 'http://localhost:4040/api/health',
                       'project': 'kroma', 'service': 'kroma', 'compose_files': ['/opt/kroma/compose.yml']}
