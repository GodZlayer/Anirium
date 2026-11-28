<?php

namespace App\Services;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class EfiPixService
{
    public function isConfigured(): bool
    {
        return trim((string) config('services.efi.client_id')) !== ''
            && trim((string) config('services.efi.client_secret')) !== ''
            && trim((string) config('services.efi.pix_key')) !== '';
    }

    public function baseUrl(): string
    {
        return config('services.efi.sandbox', false)
            ? 'https://pix-h.api.efipay.com.br'
            : 'https://pix.api.efipay.com.br';
    }

    public function chargesBaseUrl(): string
    {
        return config('services.efi.sandbox', false)
            ? 'https://cobrancas-h.api.efipay.com.br'
            : 'https://cobrancas.api.efipay.com.br';
    }

    /**
     * @return array{txid: string, pix_copy_paste: string, qrcode_image: ?string, amount_brl: float, expires_in: int}
     */
    public function createImmediateCharge(string $txid, float $amountBrl, string $description): array
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Efí Bank Pix não configurado no servidor (EFI_CLIENT_ID, EFI_CLIENT_SECRET, EFI_PIX_KEY).');
        }

        $token = $this->authenticate();
        $formattedAmount = number_format($amountBrl, 2, '.', '');
        $expiresIn = 1800;

        $chargeResponse = $this->httpClient()
            ->withToken($token)
            ->put($this->baseUrl().'/v2/cob/'.$txid, [
                'calendario' => ['expiracao' => $expiresIn],
                'valor' => ['original' => $formattedAmount],
                'chave' => (string) config('services.efi.pix_key'),
                'solicitacaoPagador' => mb_substr($description, 0, 140),
            ]);

        if (! $chargeResponse->successful()) {
            throw new RuntimeException('Falha ao criar cobrança Pix na Efí Bank (HTTP '.$chargeResponse->status().').');
        }

        $charge = $chargeResponse->json();
        $pixCopyPaste = (string) ($charge['pixCopiaECola'] ?? '');
        $qrcodeImage = null;
        $locId = $charge['loc']['id'] ?? null;

        if ($locId !== null) {
            $qrResponse = $this->httpClient()
                ->withToken($token)
                ->get($this->baseUrl().'/v2/loc/'.$locId.'/qrcode');
            if ($qrResponse->successful()) {
                $qr = $qrResponse->json();
                $pixCopyPaste = $pixCopyPaste !== '' ? $pixCopyPaste : (string) ($qr['qrcode'] ?? '');
                $qrcodeImage = isset($qr['imagemQrcode']) ? (string) $qr['imagemQrcode'] : null;
            }
        }

        return [
            'txid' => $txid,
            'pix_copy_paste' => $pixCopyPaste,
            'qrcode_image' => $qrcodeImage,
            'amount_brl' => $amountBrl,
            'expires_in' => $expiresIn,
        ];
    }

    /**
     * Queries Efí Bank directly (GET /v2/cob/{txid}) over mTLS to guarantee
     * the charge is genuinely CONCLUIDA with a settled endToEndId and sufficient amount.
     *
     * @return array{paid: bool, status: string, end_to_end_id: ?string, paid_amount: float}
     */
    public function verifyChargePaid(string $txid, float $expectedAmountBrl): array
    {
        if (! $this->isConfigured()) {
            return ['paid' => false, 'status' => 'unconfigured', 'end_to_end_id' => null, 'paid_amount' => 0.0];
        }

        $token = $this->authenticate();
        $response = $this->httpClient()
            ->withToken($token)
            ->get($this->baseUrl().'/v2/cob/'.$txid);

        if (! $response->successful()) {
            return ['paid' => false, 'status' => 'http_'.$response->status(), 'end_to_end_id' => null, 'paid_amount' => 0.0];
        }

        $body = $response->json();
        $status = strtoupper(trim((string) ($body['status'] ?? '')));
        if ($status !== 'CONCLUIDA') {
            return ['paid' => false, 'status' => $status !== '' ? $status : 'UNKNOWN', 'end_to_end_id' => null, 'paid_amount' => 0.0];
        }

        $pixList = is_array($body['pix'] ?? null) ? $body['pix'] : [];
        $paidAmount = 0.0;
        $endToEndId = null;
        foreach ($pixList as $entry) {
            if (! is_array($entry)) {
                continue;
            }
            $e2e = trim((string) ($entry['endToEndId'] ?? ''));
            $val = (float) ($entry['valor'] ?? 0);
            if ($e2e !== '' && $val > 0) {
                $paidAmount += $val;
                $endToEndId ??= $e2e;
            }
        }

        $isPaid = $endToEndId !== null && ($paidAmount + 0.01) >= $expectedAmountBrl;

        return [
            'paid' => $isPaid,
            'status' => $status,
            'end_to_end_id' => $endToEndId,
            'paid_amount' => round($paidAmount, 2),
        ];
    }

    /**
     * Creates an Efí Bank hosted Payment Link (Credit Card + Boleto/Bolix) via API Cobranças.
     *
     * @return array{charge_id: string, payment_url: string, amount_brl: float}
     */
    public function createPaymentLink(float $amountBrl, string $itemName, ?string $notificationUrl = null): array
    {
        if (! $this->isConfigured()) {
            throw new RuntimeException('Efí Bank não configurado no servidor.');
        }

        $token = $this->authenticateCharges();
        $valueCents = max(100, (int) round($amountBrl * 100));

        $payload = [
            'items' => [[
                'name' => mb_substr($itemName, 0, 200),
                'value' => $valueCents,
                'amount' => 1,
            ]],
            'settings' => [
                'payment_method' => 'all',
                'expire_at' => now()->addDays(3)->format('Y-m-d'),
                'request_delivery_address' => false,
            ],
        ];
        if ($notificationUrl !== null && $notificationUrl !== '') {
            $payload['metadata'] = ['notification_url' => $notificationUrl];
        }

        $response = $this->chargesHttpClient()
            ->withToken($token)
            ->post($this->chargesBaseUrl().'/v1/charge/one-step/link', $payload);

        if (! $response->successful()) {
            throw new RuntimeException('Falha ao gerar Link de Pagamento Efí (HTTP '.$response->status().').');
        }

        $data = $response->json('data', []);
        $chargeId = (string) ($data['charge_id'] ?? '');
        $paymentUrl = (string) ($data['payment_url'] ?? '');
        if ($chargeId === '' || $paymentUrl === '') {
            throw new RuntimeException('Resposta inválida da Efí Cobranças ao gerar link.');
        }

        return [
            'charge_id' => $chargeId,
            'payment_url' => $paymentUrl,
            'amount_brl' => $amountBrl,
        ];
    }

    public function verifyChargeLinkPaid(string $chargeId): bool
    {
        if (! $this->isConfigured() || trim($chargeId) === '') {
            return false;
        }

        $token = $this->authenticateCharges();
        $response = $this->chargesHttpClient()
            ->withToken($token)
            ->get($this->chargesBaseUrl().'/v1/charge/'.urlencode($chargeId));

        if (! $response->successful()) {
            return false;
        }

        $status = strtolower(trim((string) ($response->json('data.status') ?? '')));

        return $status === 'paid' || $status === 'settled';
    }

    private function authenticateCharges(): string
    {
        $response = $this->chargesHttpClient()
            ->withBasicAuth((string) config('services.efi.client_id'), (string) config('services.efi.client_secret'))
            ->post($this->chargesBaseUrl().'/v1/authorize', [
                'grant_type' => 'client_credentials',
            ]);

        if (! $response->successful()) {
            throw new RuntimeException('Falha na autenticação OAuth2 da Efí Cobranças (HTTP '.$response->status().').');
        }

        $token = (string) ($response->json('access_token') ?? '');
        if ($token === '') {
            throw new RuntimeException('Token Efí Cobranças vazio.');
        }

        return $token;
    }

    private function chargesHttpClient(): PendingRequest
    {
        $options = ['timeout' => 15];
        $caBundle = storage_path('app/private/efi/cacert.pem');
        if (file_exists($caBundle)) {
            $options['verify'] = $caBundle;
        }

        return Http::withOptions($options)->acceptJson();
    }

    private function authenticate(): string
    {
        $response = $this->httpClient()
            ->withBasicAuth((string) config('services.efi.client_id'), (string) config('services.efi.client_secret'))
            ->post($this->baseUrl().'/oauth/token', [
                'grant_type' => 'client_credentials',
            ]);

        if (! $response->successful()) {
            throw new RuntimeException('Falha na autenticação OAuth2 da Efí Bank (HTTP '.$response->status().').');
        }

        $token = (string) ($response->json('access_token') ?? '');
        if ($token === '') {
            throw new RuntimeException('Token de acesso Efí Bank vazio.');
        }

        return $token;
    }

    private function httpClient(): PendingRequest
    {
        $options = ['timeout' => 15];
        $certPath = trim((string) config('services.efi.certificate_path'));
        if ($certPath === '' || ! file_exists($certPath)) {
            $fallbackName = config('services.efi.sandbox', false) ? 'efi-homologacao.pem' : 'efi-producao.pem';
            $certPath = storage_path('app/private/efi/'.$fallbackName);
        }
        if (file_exists($certPath)) {
            $options['cert'] = $certPath;
        }
        $caBundle = storage_path('app/private/efi/cacert.pem');
        if (file_exists($caBundle)) {
            $options['verify'] = $caBundle;
        }

        return Http::withOptions($options)->acceptJson();
    }
}
