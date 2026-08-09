import json
import threading
import unittest
import urllib.request
from pathlib import Path

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
        self.assertEqual(payload,{'ok':True,'items':140,'version':3.2})

    def test_operational_interface_stays_clean(self):
        html=Path('index.html').read_text(encoding='utf-8')
        self.assertNotIn('Sin resultados',html)
        self.assertNotIn('Mostrar más',html)
        self.assertNotIn('0 de 140 revisados',html)
        self.assertNotIn('id="saveState"',html)
        self.assertIn('Mejoramos',html)
        self.assertIn('Más opciones',html)

    def test_modal_navigation_and_clean_export_are_available(self):
        html=Path('index.html').read_text(encoding='utf-8')
        script=Path('static/app.js').read_text(encoding='utf-8')
        self.assertIn('id="evaluationModal"',html)
        self.assertIn('id="backToRouteBtn"',html)
        self.assertIn('id="printStore"',html)
        self.assertIn('Evidencia',html)
        self.assertIn('Guardar y continuar',html)
        self.assertIn('opportunities',script)
        self.assertNotIn('Ver criterio',html)
        self.assertNotIn('Ocultar acción',html)

    def test_cleanup_workflow_is_manual_and_guarded(self):
        workflow=Path('.github/workflows/cleanup-obsolete.yml').read_text(encoding='utf-8')
        self.assertIn('workflow_dispatch',workflow)
        self.assertIn('confirmar_eliminacion',workflow)
        self.assertTrue(Path('tools/cleanup_obsolete.py').is_file())


if __name__=='__main__':
    unittest.main()
