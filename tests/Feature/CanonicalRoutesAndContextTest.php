<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class CanonicalRoutesAndContextTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Teste 1: A rota raiz (Lobby) renderiza a view Blade 'pages.lobby' com sucesso.
     */
    public function test_lobby_renders_successfully(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
        $response->assertViewIs('pages.lobby');
    }

    /**
     * Teste 2: Rota canônica de Universo (/view/universe/:id) redireciona para / e define initial_context na sessão.
     */
    public function test_universe_canonical_route_renders_context_view(): void
    {
        $response = $this->get('/view/universe/269');

        $response->assertRedirect('/');
        $response->assertSessionHas('initial_context', [
            'type' => 'universe',
            'id' => '269',
        ]);
    }

    /**
     * Teste 3: Rota canônica de Obra (/view/work/:id) redireciona para / com sessão de contexto.
     */
    public function test_work_canonical_route_renders_context_view(): void
    {
        $response = $this->get('/view/work/269');

        $response->assertRedirect('/');
        $response->assertSessionHas('initial_context', [
            'type' => 'work',
            'id' => '269',
        ]);
    }

    /**
     * Teste 4: Rota canônica de Arco (/view/arc/:id) redireciona para / com sessão de contexto.
     */
    public function test_arc_canonical_route_renders_context_view(): void
    {
        $response = $this->get('/view/arc/269');

        $response->assertRedirect('/');
        $response->assertSessionHas('initial_context', [
            'type' => 'arc',
            'id' => '269',
        ]);
    }

    /**
     * Teste 5: Rota canônica de Episódio (/view/episode/:id) redireciona para / com sessão de contexto.
     */
    public function test_episode_canonical_route_renders_context_view(): void
    {
        $response = $this->get('/view/episode/269');

        $response->assertRedirect('/');
        $response->assertSessionHas('initial_context', [
            'type' => 'episode',
            'id' => '269',
        ]);
    }
}
