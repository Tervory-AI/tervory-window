"""One production-panel fixture path per founder row."""
import os
from pathlib import Path
import re
import subprocess
import unittest
ROOT = Path(__file__).resolve().parents[2]
CASES = dict(zip(range(1, 14), ['ask', 'signin-us', 'signin-za', 'undo', 'partial', 'reject', 'trust', 'command', 'command-deny', 'plugins', 'offline', 'stale', 'cancel-review']))
class WindowAcceptance(unittest.TestCase):
    def test_one_row_one_case(self):
        rows = re.findall(r'^\| WINDOW-(\d+) \|', (ROOT / 'docs/acceptance/window.md').read_text(), re.M)
        self.assertEqual(sorted(map(int, rows)), sorted(CASES))
        self.assertEqual(len(rows), len(set(rows)))
def case(scenario):
    def run(self):
        subprocess.run(['node', 'test/panel.mjs', scenario], cwd=ROOT,
                       env=dict(os.environ, TMPDIR=str(ROOT / '.tmp')),
                       check=True, timeout=120, capture_output=True, text=True)
    return run
for row, scenario in CASES.items():
    setattr(WindowAcceptance, f'test_window_{row:02}', case(scenario))
