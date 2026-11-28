<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EfiPixPaymentTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_create_efi_pix_charge_and_activate_plus_via_webhook(): void
    {
        config()->set('services.efi.client_id', 'efi-client-test');
        config()->set('services.efi.client_secret', 'efi-secret-test');
        config()->set('services.efi.pix_key', 'pix@anirium.com.br');
        config()->set('services.efi.sandbox', true);
        config()->set('services.efi.monthly_price_brl', 5.50);
        config()->set('services.efi.webhook_secret', 'wh-secret-123');

        Http::fake([
            'https://pix-h.api.efipay.com.br/oauth/token' => Http::response([
                'access_token' => 'fake-efi-token',
            ], 200),
            'https://pix-h.api.efipay.com.br/v2/cob/*' => Http::sequence()
                ->push([
                    'txid' => 'ANIRIUMTEST123',
                    'pixCopiaECola' => '00020126580014br.gov.bcb.pix0118pix@anirium.com.br5204000053039865802BR',
                    'loc' => ['id' => 42],
                ], 201)
                // First webhook verification: charge is still ATIVA (spoofed webhook must NOT activate)
                ->push([
                    'status' => 'ATIVA',
                    'valor' => ['original' => '5.50'],
                    'pix' => [],
                ], 200)
                // Second webhook verification: charge is genuinely CONCLUIDA with endToEndId
                ->push([
                    'status' => 'CONCLUIDA',
                    'valor' => ['original' => '5.50'],
                    'pix' => [[
                        'endToEndId' => 'E12345678202611232130ABCDEF12345',
                        'valor' => '5.50',
                    ]],
                ], 200),
            'https://pix-h.api.efipay.com.br/v2/loc/42/qrcode' => Http::response([
                'qrcode' => '00020126580014br.gov.bcb.pix0118pix@anirium.com.br5204000053039865802BR',
                'imagemQrcode' => 'data:image/png;base64,iVBORw0KGgo=',
            ], 200),
        ]);

        $user = User::factory()->create(['tier' => 1]);

        $createResp = $this->actingAs($user)
            ->postJson('/api/anirium-plus/pix');

        $createResp->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('amount_brl', 5.5);

        $txid = (string) $createResp->json('txid');
        $this->assertNotEmpty($txid);

        // Webhook with wrong secret is rejected
        $this->postJson('/api/webhooks/efi/pix?secret=wrong', [
            'pix' => [['txid' => $txid]],
        ])->assertStatus(403);

        // Spoofed/premature webhook when Efí still says ATIVA must NOT activate Plus
        $this->postJson('/api/webhooks/efi/pix?secret=wh-secret-123', [
            'pix' => [['txid' => $txid]],
        ])->assertOk()->assertJsonPath('processed', 0);
        $user->refresh();
        $this->assertSame(1, (int) $user->tier);

        // Valid webhook when Efí confirms CONCLUIDA + endToEndId activates Anirium+ for 30 days
        $this->postJson('/api/webhooks/efi/pix?secret=wh-secret-123', [
            'pix' => [['txid' => $txid]],
        ])->assertOk()->assertJsonPath('processed', 1);

        $user->refresh();
        $this->assertSame(2, (int) $user->tier);
        $this->assertTrue($user->hasActiveAniriumPlus());
        $this->assertNotNull($user->anirium_plus_expires_at);

        // Status endpoint reflects paid
        $this->actingAs($user)
            ->getJson('/api/anirium-plus/pix/'.$txid)
            ->assertOk()
            ->assertJsonPath('status', 'paid');
    }
}
