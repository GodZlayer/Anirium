"""Create disposable TLS certificates for the isolated Node transport test."""
import datetime
import ipaddress
import pathlib
import sys
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

directory = pathlib.Path(sys.argv[1])
now = datetime.datetime.now(datetime.timezone.utc)
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Disposable Anirium TLS fixture")])
ca = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
      .serial_number(x509.random_serial_number()).not_valid_before(now-datetime.timedelta(minutes=5))
      .not_valid_after(now+datetime.timedelta(days=1))
      .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True).sign(key, hashes.SHA256()))
(directory / "ca.pem").write_bytes(ca.public_bytes(serialization.Encoding.PEM))
for label, names in [("valid", [x509.DNSName("localhost"), x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),
                     ("localhost-only", [x509.DNSName("localhost")]),
                     ("expired", [x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),
                     ("future", [x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),
                     ("wrong", [x509.DNSName("wrong.invalid")])]:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, label)])
    certificate = (x509.CertificateBuilder().subject_name(subject).issuer_name(ca.subject).public_key(private.public_key())
                   .serial_number(x509.random_serial_number()).not_valid_before(now+datetime.timedelta(days=1) if label == "future" else now-datetime.timedelta(days=2))
                   .not_valid_after(now-datetime.timedelta(days=1) if label == "expired" else now+datetime.timedelta(days=2))
                   .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
                   .add_extension(x509.SubjectAlternativeName(names), critical=False).sign(key, hashes.SHA256()))
    (directory / f"{label}.pem").write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    (directory / f"{label}.key").write_bytes(private.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
