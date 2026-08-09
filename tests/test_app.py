import json
import threading
import unittest
import urllib.request

import app


class RSADigitalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=app.create_server(port=0)
        cls.port=cls.server.server_address[1]
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.thread.join(timeout=2)

    def get(self,path):
        return urllib.request.urlopen(f'http://127.0.0.1:{self.port}{path}')

    def test_database_is_complete_and_unique(self):
        payload=app.load_checklist()
        self.assertEqual(payload['metadata']['item_count'],140)
        ids=[item['id'] for item in payload['items']]
        self.assertEqual(len(ids),len(set(ids)))
        self.assertEqual(ids[0],'I001')
        self.assertEqual(ids[-1],'I140')

    def test_pages_assets_and_api(self):
        for path in ['/','/static/styles.css','/static/app.js','/manifest.json','/data/checklist.json']:
            with self.get(path) as response:
                self.assertEqual(response.status,200)
                self.assertGreater(len(response.read()),100)
        with self.get('/api/checklist') as response:
            payload=json.load(response)
        self.assertEqual(len(payload['items']),140)

    def test_health(self):
        with self.get('/api/health') as response:
            payload=json.load(response)
        self.assertEqual(payload,{'ok':True,'items':140,'version':3})


if __name__=='__main__':
    unittest.main()
