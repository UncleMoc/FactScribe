# -*- coding: utf-8 -*-
"""改项目名与简介：`POST /api/projects/update`。

要点：
  * 要 token，也要 `--allow-write`（它写盘：登记册 + `factscribe.toml`）；
  * 路径不在登记册里 → 400（不凭空造项目）；
  * 登记册的 `name`/`description` 与 `factscribe.toml` 的 `title`/`description`
    一起改，其它键（sections/facts/bib…）一个字都不动；
  * 只读服务一律 403。

一切都在临时 HOME 与临时目录里做，不碰用户机器上的任何东西。
"""
from __future__ import annotations

import json
import os
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

from factscribe.serve import create_server  # noqa: E402

TOKEN = "update-token"


class ProjectsUpdateTest(unittest.TestCase):
    """可写服务：改名字与简介；只读服务：拦在门外。"""

    @classmethod
    def setUpClass(cls):
        cls.home = tempfile.mkdtemp(prefix="factscribe-update-")
        cls.saved_home = os.environ.get("HOME")
        os.environ["HOME"] = cls.home
        cls.work = Path(cls.home) / "work"
        cls.work.mkdir(parents=True, exist_ok=True)
        cls.root = cls.work / "paper"
        shutil.copytree(ROOT / "examples" / "minimal", cls.root)
        cls.server, cls.token = create_server(None, port=0, token=TOKEN,
                                              allow_write=True)
        cls.port = cls.server.server_address[1]
        cls.base = "http://127.0.0.1:%d" % cls.port
        cls.thread = threading.Thread(target=cls.server.serve_forever,
                                      daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        if cls.saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = cls.saved_home
        shutil.rmtree(cls.home, ignore_errors=True)

    def _request(self, path, method="GET", token=None, body=None):
        headers = {}
        if token:
            headers["Authorization"] = "Bearer " + token
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(self.base + path, method=method,
                                     headers=headers, data=data)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try:
                raw = exc.read().decode("utf-8")
            finally:
                exc.close()
            return exc.code, json.loads(raw) if raw else {}

    def _register(self, path):
        """把文件夹登记进册子（直接写登记册，不经接口）。"""
        registry_file = Path(self.home) / ".factscribe" / "projects.json"
        registry = {"version": 1, "projects": [
            {"path": str(Path(path).resolve()), "name": "旧名字",
             "description": "旧简介", "lastOpenedAt": "2026-01-01T00:00:00+00:00"}],
            "lastPath": "", "python": "", "pythonpath": ""}
        registry_file.parent.mkdir(parents=True, exist_ok=True)
        registry_file.write_text(json.dumps(registry), encoding="utf-8")
        return str(Path(path).resolve())

    def _registry(self):
        registry_file = Path(self.home) / ".factscribe" / "projects.json"
        return json.loads(registry_file.read_text(encoding="utf-8"))

    def test_update_changes_registry_and_toml(self):
        target = self._register(self.root)
        status, data = self._request(
            "/api/projects/update", method="POST", token=self.token,
            body={"path": target, "name": "新名字", "description": "新简介"})
        self.assertEqual(status, 200, data)
        self.assertTrue(data["ok"])
        self.assertEqual(data["project"]["name"], "新名字")
        self.assertEqual(data["project"]["description"], "新简介")
        # 登记册改了
        row = self._registry()["projects"][0]
        self.assertEqual(row["name"], "新名字")
        self.assertEqual(row["description"], "新简介")
        # factscribe.toml 也改了
        text = (self.root / "factscribe.toml").read_text(encoding="utf-8")
        self.assertIn('title = "新名字"', text)
        self.assertIn('description = "新简介"', text)
        # 其它键原样保留
        self.assertIn("sections", text)
        self.assertIn("facts", text)

    def test_update_keeps_other_toml_keys(self):
        target = self._register(self.root)
        before = (self.root / "factscribe.toml").read_text(encoding="utf-8")
        status, data = self._request(
            "/api/projects/update", method="POST", token=self.token,
            body={"path": target, "name": "改名了", "description": "换了简介"})
        self.assertEqual(status, 200, data)
        after = (self.root / "factscribe.toml").read_text(encoding="utf-8")
        for key in ("sections", "facts", "bib", "build", "authors"):
            self.assertIn(key, after, key + " 不该被改掉")
        self.assertNotEqual(before, after)

    def test_update_rejects_path_not_in_registry(self):
        status, data = self._request(
            "/api/projects/update", method="POST", token=self.token,
            body={"path": str(self.work / "never-registered"),
                  "name": "x", "description": "y"})
        self.assertEqual(status, 400)
        self.assertEqual(data["error"]["code"], "PROJECT_NOT_REGISTERED")

    def test_update_requires_token(self):
        status, data = self._request("/api/projects/update", method="POST",
                                      body={"path": str(self.root),
                                            "name": "x", "description": "y"})
        self.assertEqual(status, 401)
        self.assertEqual(data["error"]["code"], "UNAUTHORIZED")


class ReadOnlyUpdateTest(unittest.TestCase):
    """只读服务：更新接口一律 403（它要写盘）。"""

    @classmethod
    def setUpClass(cls):
        cls.home = tempfile.mkdtemp(prefix="factscribe-update-ro-")
        cls.saved_home = os.environ.get("HOME")
        os.environ["HOME"] = cls.home
        cls.server, cls.token = create_server(None, port=0, token=TOKEN)
        cls.port = cls.server.server_address[1]
        cls.base = "http://127.0.0.1:%d" % cls.port
        cls.thread = threading.Thread(target=cls.server.serve_forever,
                                      daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        if cls.saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = cls.saved_home
        shutil.rmtree(cls.home, ignore_errors=True)

    def _request(self, path, method="GET", token=None, body=None):
        headers = {}
        if token:
            headers["Authorization"] = "Bearer " + token
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(self.base + path, method=method,
                                     headers=headers, data=data)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try:
                raw = exc.read().decode("utf-8")
            finally:
                exc.close()
            return exc.code, json.loads(raw) if raw else {}

    def test_read_only_server_refuses_update(self):
        status, data = self._request(
            "/api/projects/update", method="POST", token=self.token,
            body={"path": "/tmp/whatever", "name": "x", "description": "y"})
        self.assertEqual(status, 403)
        self.assertEqual(data["error"]["code"], "READ_ONLY")


if __name__ == "__main__":
    unittest.main()
