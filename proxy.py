import http.server
import http.client
import urllib.parse
import sys

TARGET_HOST = "127.0.0.1"
TARGET_PORT = 5173

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            conn = http.client.HTTPConnection(TARGET_HOST, TARGET_PORT)
            conn.request("GET", parsed.path + "?" + parsed.query if parsed.query else parsed.path)
            response = conn.getresponse()
            
            self.send_response(response.status)
            for header, value in response.getheaders():
                if header.lower() not in ['content-length']:
                    self.send_header(header, value)
            self.end_headers()
            
            self.wfile.write(response.read())
            conn.close()
        except Exception as e:
            self.send_error(500, str(e))
    
    def do_POST(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            conn = http.client.HTTPConnection(TARGET_HOST, TARGET_PORT)
            headers = {k: v for k, v in self.headers.items() if k.lower() != 'host'}
            conn.request("POST", parsed.path + "?" + parsed.query if parsed.query else parsed.path, body, headers)
            response = conn.getresponse()
            
            self.send_response(response.status)
            for header, value in response.getheaders():
                if header.lower() not in ['content-length']:
                    self.send_header(header, value)
            self.end_headers()
            
            self.wfile.write(response.read())
            conn.close()
        except Exception as e:
            self.send_error(500, str(e))
    
    def do_PUT(self):
        self.do_POST()
    
    def do_DELETE(self):
        self.do_GET()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
    
    def log_message(self, format, *args):
        pass

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = http.server.HTTPServer(('0.0.0.0', port), ProxyHandler)
    print(f"Proxy server running on http://0.0.0.0:{port}/")
    server.serve_forever()