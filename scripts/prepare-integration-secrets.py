"""Create persistent deployment keys outside the repository; never print key material."""
import base64
import datetime
import ipaddress
import json
import os
import pathlib
import secrets
import sys
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

directory = pathlib.Path(sys.argv[1]).resolve()
project = pathlib.Path(__file__).resolve().parent.parent
if directory == project or project in directory.parents:
    raise SystemExit("Deployment secrets must be outside repository")
directory.mkdir(parents=True, exist_ok=True)
names = ["ca.pem", "server.pem", "server.key", "data-keyring.json", "identity-keyring.json"]
existing = [name for name in names if (directory / name).exists()]
if existing:
    if len(existing) != len(names):
        raise SystemExit("Partial secret set: preserve existing files, inspect before repair")
    print("Existing deployment secrets preserved")
    raise SystemExit(0)
now = datetime.datetime.now(datetime.timezone.utc)
ca_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Anirium private PostgreSQL CA")])
ca = (x509.CertificateBuilder().subject_name(ca_name).issuer_name(ca_name)
      .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
      .not_valid_before(now-datetime.timedelta(minutes=5)).not_valid_after(now+datetime.timedelta(days=3650))
      .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True).sign(ca_key, hashes.SHA256()))
server_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
server = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "anirium_db")]))
          .issuer_name(ca_name).public_key(server_key.public_key()).serial_number(x509.random_serial_number())
          .not_valid_before(now-datetime.timedelta(minutes=5)).not_valid_after(now+datetime.timedelta(days=365))
          .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
          .add_extension(x509.SubjectAlternativeName([x509.DNSName("anirium_db"), x509.DNSName("anirium-db"), x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), critical=False)
          .sign(ca_key, hashes.SHA256()))
payloads = {"ca.pem": ca.public_bytes(serialization.Encoding.PEM),
            "server.pem": server.public_bytes(serialization.Encoding.PEM),
            "server.key": server_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())}
for name in ["data-keyring.json", "identity-keyring.json"]:
    payloads[name] = json.dumps({"activeKeyId": "integration-20261004", "keys": [{"id": "integration-20261004", "key": base64.b64encode(secrets.token_bytes(32)).decode()}]}).encode()
for name, payload in payloads.items():
    fd = os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as output:
        output.write(payload)
print("Deployment certificates and distinct keyrings created; values not logged")
