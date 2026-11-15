# -*- coding: utf-8 -*-
"""三个页面的顶部操作：新建报告模板、引用添加/删除（走 HTTP 接口）。

钉住：

* **新建报告模板**：文件真的生成（带注释、字段齐）、重复 409、非法 id 400、
  只读 403；建完的报告要出现在报告列表里。
* **引用添加**：条目真的进了 bib、重复 409、非法 key 400；加完要出现在引用列表里。
* **引用删除**：这一条消失、别的条目还在、找不到 404；只读 403。

跑法（仓根）：python3 -m unittest discover -s tests -p "test_top_actions.py"
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from factscribe.report import ReportError, load_report  # noqa: E402
from factscribe.serve import create_server  # noqa: E402

TOKEN = "top-actions-token"
EXAMPLE = ROOT / "examples" / "minimal"


def _bib_blocks(text: str) -> list:
    """bib 文本里的每个条目块（@type{key, … }）。"""
    return re.findall(r"@\w+\{.*?\n\}", text, re.S)


class WorkbenchServerCase(unittest.TestCase):
    """每个用例一份临时项目副本 + 一个本机服务，跑完即扔。"""

    allow_write = True

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "paper"
        shutil.copytree(EXAMPLE, self.root)
        self.server, self.token = create_server(
            self.root, port=0, token=TOKEN, allow_write=self.allow_write)
        self.base = "http://127.0.0.1:%d" % self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever,
                                       daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.tmp.cleanup()

    def _call(self, path, body=None, method="POST"):
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(self.base + path, method=method, data=data)
        req.add_header("Authorization", "Bearer " + TOKEN)
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            exc.close()
            return exc.code, json.loads(raw)

    def _get(self, path):
        req = urllib.request.Request(self.base + path)
        req.add_header("Authorization", "Bearer " + TOKEN)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            exc.close()
            return exc.code, json.loads(raw)


# ============================================================ 新建报告模板


class ReportTemplateTest(WorkbenchServerCase):
    """POST /api/reports/template：写一份带注释的报告模板。"""

    def test_template_file_is_written_with_the_expected_fields(self):
        status, data = self._call("/api/reports/template",
                                  {"id": "report-test"})
        self.assertEqual(status, 200, data)
        self.assertTrue(data["ok"])
        self.assertEqual(data["path"], "reports/report-test.report.toml")
        target = self.root / "reports" / "report-test.report.toml"
        self.assertTrue(target.is_file(), "模板文件应该落在 reports/ 下")
        text = target.read_text(encoding="utf-8")
        for needle in ('schema = "factscribe/report@1"',
                       'id = "report-test"',
                       "experiment = ",
                       'status = "partial"',
                       "generated_at = ",
                       "population = { id = ",
                       "# [[metric]]"):
            self.assertIn(needle, text, "模板里要有：" + needle)

    def test_template_is_valid_except_the_commented_out_metric(self):
        """模板除了注释掉的 metric，其余字段必须真能被引擎读懂。"""
        self._call("/api/reports/template", {"id": "report-test"})
        with self.assertRaises(ReportError) as ctx:
            load_report(self.root, "reports/report-test.report.toml")
        # 只有 metric 缺失这一条错：说明 schema/id/status/population 都过了。
        self.assertEqual(ctx.exception.code, "MISSING_FIELD")
        self.assertIn("metric", ctx.exception.message)

    def test_template_appears_in_the_report_list(self):
        self._call("/api/reports/template", {"id": "report-test"})
        status, data = self._get("/api/reports")
        self.assertEqual(status, 200, data)
        ids = [r["id"] for r in data["reports"]]
        self.assertIn("report-test", ids)

    def test_duplicate_template_is_409(self):
        self._call("/api/reports/template", {"id": "report-test"})
        status, data = self._call("/api/reports/template", {"id": "report-test"})
        self.assertEqual(status, 409, data)
        self.assertEqual(data["error"]["code"], "REPORT_EXISTS")

    def test_invalid_id_is_400(self):
        for bad in ("../evil", "a/b", "报告 1", "", ".."):
            status, data = self._call("/api/reports/template", {"id": bad})
            self.assertEqual(status, 400, (bad, data))
            self.assertEqual(data["error"]["code"], "REPORT_ID_INVALID")
        self.assertFalse((self.root / "reports").exists(),
                         "非法 id 不该留下任何文件")


class ReportTemplateReadOnlyTest(WorkbenchServerCase):
    """只读工作台：新建模板是写盘的活，一律拒。"""

    allow_write = False

    def test_read_only_is_403(self):
        status, data = self._call("/api/reports/template", {"id": "report-x"})
        self.assertEqual(status, 403, data)
        self.assertEqual(data["error"]["code"], "READ_ONLY")
        self.assertFalse((self.root / "reports").exists())


# ============================================================ 引用添加


class CitationAddTest(WorkbenchServerCase):
    """POST /api/citations/add：往项目的 cfg.bib 末尾追加一条。"""

    def _bib(self):
        return (self.root / "refs.bib").read_text(encoding="utf-8")

    def test_entry_lands_in_the_bib_file(self):
        before = self._bib()
        status, data = self._call("/api/citations/add", {
            "key": "smith2024", "title": "A New Paper",
            "author": "Smith, Jane", "year": "2024",
            "doi": "10.1000/smith",
        })
        self.assertEqual(status, 200, data)
        self.assertTrue(data["ok"])
        self.assertEqual(data["key"], "smith2024")
        after = self._bib()
        self.assertTrue(after.startswith(before), "原有内容不许被改写")
        self.assertIn("@article{smith2024,", after)
        self.assertIn("title = {A New Paper}", after)
        self.assertIn("author = {Smith, Jane}", after)
        self.assertIn("year = {2024}", after)
        self.assertIn("doi = {10.1000/smith}", after)

    def test_entry_shows_up_in_the_citation_list(self):
        self._call("/api/citations/add", {"key": "smith2024",
                                         "title": "A New Paper"})
        status, data = self._get("/api/citations")
        self.assertEqual(status, 200, data)
        keys = [e["key"] for e in data["entries"]]
        self.assertIn("smith2024", keys)

    def test_duplicate_key_is_409(self):
        self._call("/api/citations/add", {"key": "smith2024"})
        status, data = self._call("/api/citations/add", {"key": "smith2024"})
        self.assertEqual(status, 409, data)
        self.assertEqual(data["error"]["code"], "CITATION_EXISTS")
        self.assertEqual(self._bib().count("@article{smith2024,"), 1)

    def test_invalid_key_is_400(self):
        for bad in ("bad key", "a/b", "带中文", ""):
            status, data = self._call("/api/citations/add", {"key": bad})
            self.assertEqual(status, 400, (bad, data))
            self.assertEqual(data["error"]["code"], "CITATION_INVALID")
        self.assertNotIn("smith2024", self._bib())


class CitationAddReadOnlyTest(WorkbenchServerCase):
    """只读工作台：改 bib 是写盘的活，一律拒。"""

    allow_write = False

    def test_read_only_is_403(self):
        before = (self.root / "refs.bib").read_text(encoding="utf-8")
        status, data = self._call("/api/citations/add", {"key": "smith2024"})
        self.assertEqual(status, 403, data)
        self.assertEqual(data["error"]["code"], "READ_ONLY")
        self.assertEqual((self.root / "refs.bib").read_text(encoding="utf-8"),
                         before)


# ============================================================ 引用删除


class CitationDeleteTest(WorkbenchServerCase):
    """POST /api/citations/delete：把该 key 的条目从 bib 里抠掉。"""

    def _bib(self):
        return (self.root / "refs.bib").read_text(encoding="utf-8")

    def _keys(self):
        _status, data = self._get("/api/citations")
        return [e["key"] for e in data["entries"]]

    def test_deleted_entry_disappears(self):
        self._call("/api/citations/add", {"key": "smith2024",
                                         "title": "A New Paper"})
        self.assertIn("smith2024", self._bib())
        status, data = self._call("/api/citations/delete", {"key": "smith2024"})
        self.assertEqual(status, 200, data)
        self.assertTrue(data["ok"])
        self.assertNotIn("@article{smith2024,", self._bib())
        self.assertNotIn("smith2024", self._keys())

    def test_other_entries_survive(self):
        before = self._bib()
        self._call("/api/citations/add", {"key": "smith2024"})
        self._call("/api/citations/delete", {"key": "smith2024"})
        after = self._bib()
        # 别人的条目一个字都不许少：原来每个条目块都还在，条数也一样。
        for block in _bib_blocks(before):
            self.assertIn(block, after, "别的条目被动了：" + block[:40])
        self.assertEqual(len(_bib_blocks(after)), len(_bib_blocks(before)))
        self.assertNotIn("smith2024", after)
        keys = self._keys()
        self.assertIn("lewis2020rag", keys)
        self.assertIn("chen2023factscore", keys)

    def test_missing_key_is_404(self):
        status, data = self._call("/api/citations/delete", {"key": "nope2024"})
        self.assertEqual(status, 404, data)
        self.assertEqual(data["error"]["code"], "CITATION_MISSING")

    def test_invalid_key_is_400(self):
        status, data = self._call("/api/citations/delete", {"key": "bad key"})
        self.assertEqual(status, 400, data)
        self.assertEqual(data["error"]["code"], "CITATION_INVALID")


class CitationDeleteReadOnlyTest(WorkbenchServerCase):
    """只读工作台：删 bib 里的条目一律拒。"""

    allow_write = False

    def test_read_only_is_403(self):
        before = (self.root / "refs.bib").read_text(encoding="utf-8")
        status, data = self._call("/api/citations/delete",
                                  {"key": "lewis2020rag"})
        self.assertEqual(status, 403, data)
        self.assertEqual(data["error"]["code"], "READ_ONLY")
        self.assertEqual((self.root / "refs.bib").read_text(encoding="utf-8"),
                         before)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
