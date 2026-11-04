"""One production-panel fixture path per founder row."""
from functools import lru_cache
import os
from pathlib import Path
import re
import subprocess
import unittest
ROOT = Path(__file__).resolve().parents[2]
CASES = dict(zip(range(1, 14), ['ask', 'signin-us', 'signin-za', 'undo', 'partial', 'reject', 'trust', 'command', 'command-deny', 'plugins', 'offline', 'stale', 'cancel-review']))
CASES.update({14:'editor:autocomplete',15:'editor:inline edit',16:'editor:project rules',17:'agents:task uses only',18:'agents:GitHub credential is entered',19:'agents:one inline cancel action',20:'agents:an invalid Tervory credential',21:'agents:PR review sends a named credential',22:'agents:disabling a webhook',23:'agents:webhook secret is copied only',24:'agents:finished reviews link',25:'agents:receipt view shows',26:'agents:agents reuse Trigger sign-in',27:'editor:shared sign-out'})

@lru_cache(maxsize=1)
def editor_proof():
    try:
        result = subprocess.run(['node', 'test/editor-suite.mjs'], cwd=ROOT, env=dict(os.environ, TMPDIR=str(ROOT / '.tmp')), check=False, timeout=300, capture_output=True, text=True)
        return result.returncode, result.stdout + result.stderr
    except subprocess.TimeoutExpired as error:
        proof = (error.stdout or b'') + (error.stderr or b'')
        return 124, 'Editor acceptance timed out on this host.\n' + proof.decode('utf8', errors='replace')

class WindowAcceptance(unittest.TestCase):
    def test_one_row_one_case(self):
        rows = re.findall(r'^\| WINDOW-(\d+) \|', (ROOT / 'docs/acceptance/window.md').read_text(), re.M)
        self.assertEqual(sorted(map(int, rows)), sorted(CASES))
        self.assertEqual(len(rows), len(set(rows)))
def case(scenario):
    def run(self):
        if scenario.startswith('editor:'):
            code, proof = editor_proof()
            self.assertEqual(code, 0, proof)
            self.assertIn('PASS ' + scenario.split(':', 1)[1] + ':', proof)
            return
        if scenario.startswith('agents:'):
            result = subprocess.run(['node', '--test', '--test-reporter=tap', '--test-name-pattern=' + scenario.split(':', 1)[1], 'extensions/tervory-agents/test/extension.test.cjs'], cwd=ROOT, check=True, timeout=60, capture_output=True, text=True)
            self.assertIn('# pass 1', result.stdout)
            self.assertIn('# fail 0', result.stdout)
            return
        result = subprocess.run(['node', 'test/panel.mjs', scenario], cwd=ROOT,
                       env=dict(os.environ, TMPDIR=str(ROOT / '.tmp')),
                       check=False, timeout=120, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('passed ' + scenario, result.stdout)
    return run
for row, scenario in CASES.items():
    setattr(WindowAcceptance, f'test_window_{row:02}', case(scenario))
