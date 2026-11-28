<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\EfiPixService;
use App\Services\UsdExchangeRateService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class AniriumPlusPaymentsTest extends TestCase
{
    use RefreshDatabase;

    public function test_pricing_applies_live_usd_rate_plus_three_percent(): void
    {
        $rateMock = Mockery::mock(UsdExchangeRateService::class);
        $rateMock->shouldReceive('getRate')->andReturn([
            'base_rate' => 6.00,
            'markup_percent' => 3.0,
            'effective_rate' => 6.18,
            'source' => 'awesomeapi',
            'updated_at' => now()->toIso8601String(),
        ]);
        $this->app->instance(UsdExchangeRateService::class, $rateMock);

        $response = $this->getJson('/api/anirium-plus/pricing');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('rate.markup_percent', 3)
            ->assertJsonPath('plans.monthly.usd', 0.99)
            ->assertJsonPath('plans.monthly.brl', 6.12)
            ->assertJsonPath('plans.annual.usd', 9.99)
            ->assertJsonPath('plans.annual.brl', 61.74);
    }

    public function test_gift_to_handle_credits_recipient_on_payment_confirmation(): void
    {
        $buyer = User::factory()->create(['handle' => 'comprador', 'tier' => 1]);
        $recipient = User::factory()->create(['handle' => 'amigo_plus', 'tier' => 1]);

        $rateMock = Mockery::mock(UsdExchangeRateService::class);
        $rateMock->shouldReceive('getRate')->andReturn([
            'base_rate' => 6.00,
            'markup_percent' => 3.0,
            'effective_rate' => 6.18,
            'source' => 'test',
            'updated_at' => now()->toIso8601String(),
        ]);
        $this->app->instance(UsdExchangeRateService::class, $rateMock);

        $efiMock = Mockery::mock(EfiPixService::class);
        $efiMock->shouldReceive('isConfigured')->andReturn(true);
        $efiMock->shouldReceive('createImmediateCharge')->once()->andReturn([
            'txid' => 'ANIRIUMTESTGIFT123456789012',
            'pix_copy_paste' => '000201PIXTEST',
            'qrcode_image' => null,
            'amount_brl' => 6.12,
            'expires_in' => 1800,
        ]);
        $efiMock->shouldReceive('verifyChargePaid')->once()->andReturn([
            'paid' => true,
            'status' => 'CONCLUIDA',
            'end_to_end_id' => 'E123456789',
            'paid_amount' => 6.12,
        ]);
        $this->app->instance(EfiPixService::class, $efiMock);

        $this->actingAs($buyer)
            ->getJson('/api/anirium-plus/lookup-user?handle=@amigo_plus')
            ->assertOk()
            ->assertJsonPath('found', true)
            ->assertJsonPath('user.handle', 'amigo_plus');

        $create = $this->actingAs($buyer)->postJson('/api/anirium-plus/pix', [
            'plan' => 'monthly',
            'mode' => 'gift_user',
            'recipient_handle' => '@amigo_plus',
        ]);

        $create->assertOk()
            ->assertJsonPath('mode', 'gift_user')
            ->assertJsonPath('recipient_handle', 'amigo_plus')
            ->assertJsonPath('amount_brl', 6.12);

        $txid = $create->json('txid');

        $this->actingAs($buyer)
            ->getJson('/api/anirium-plus/pix/'.$txid)
            ->assertOk()
            ->assertJsonPath('status', 'paid')
            ->assertJsonPath('purchase_mode', 'gift_user')
            ->assertJsonPath('recipient_handle', 'amigo_plus');

        $buyer->refresh();
        $recipient->refresh();

        $this->assertSame(1, (int) $buyer->tier);
        $this->assertSame(2, (int) $recipient->tier);
        $this->assertNotNull($recipient->anirium_plus_expires_at);
    }

    public function test_gift_key_can_be_purchased_listed_and_redeemed_once(): void
    {
        $buyer = User::factory()->create(['handle' => 'key_buyer', 'tier' => 1]);
        $redeemer = User::factory()->create(['handle' => 'key_user', 'tier' => 1]);

        $rateMock = Mockery::mock(UsdExchangeRateService::class);
        $rateMock->shouldReceive('getRate')->andReturn([
            'base_rate' => 6.00,
            'markup_percent' => 3.0,
            'effective_rate' => 6.18,
            'source' => 'test',
            'updated_at' => now()->toIso8601String(),
        ]);
        $this->app->instance(UsdExchangeRateService::class, $rateMock);

        $efiMock = Mockery::mock(EfiPixService::class);
        $efiMock->shouldReceive('isConfigured')->andReturn(true);
        $efiMock->shouldReceive('createPaymentLink')->once()->andReturn([
            'charge_id' => '998877',
            'payment_url' => 'https://pagamento.sejaefi.com.br/test',
            'amount_brl' => 61.74,
        ]);
        $efiMock->shouldReceive('verifyChargeLinkPaid')->once()->with('998877')->andReturn(true);
        $this->app->instance(EfiPixService::class, $efiMock);

        $create = $this->actingAs($buyer)->postJson('/api/anirium-plus/checkout', [
            'plan' => 'annual',
            'mode' => 'gift_key',
        ]);

        $create->assertOk()
            ->assertJsonPath('mode', 'gift_key')
            ->assertJsonPath('payment_url', 'https://pagamento.sejaefi.com.br/test');

        $status = $this->actingAs($buyer)->getJson('/api/anirium-plus/pix/'.$create->json('txid'));
        $status->assertOk()
            ->assertJsonPath('status', 'paid')
            ->assertJsonPath('purchase_mode', 'gift_key');

        $keyCode = (string) $status->json('gift_key_code');
        $this->assertStringStartsWith('ANIRIUM-', $keyCode);

        $this->actingAs($buyer)
            ->getJson('/api/anirium-plus/keys')
            ->assertOk()
            ->assertJsonPath('keys.0.code', $keyCode);

        $this->actingAs($redeemer)
            ->postJson('/api/anirium-plus/keys/redeem', ['code' => $keyCode])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('days_added', 365);

        $redeemer->refresh();
        $this->assertSame(2, (int) $redeemer->tier);
        $this->assertNotNull($redeemer->anirium_plus_expires_at);

        // Second redemption must fail with 409 Conflict
        $this->actingAs($buyer)
            ->postJson('/api/anirium-plus/keys/redeem', ['code' => $keyCode])
            ->assertStatus(409);
    }
}
