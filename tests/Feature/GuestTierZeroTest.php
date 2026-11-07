<?php

namespace Tests\Feature;

use Tests\TestCase;

class GuestTierZeroTest extends TestCase
{
    public function test_guest_cannot_mutate_account_or_install_addons(): void
    {
        foreach (['/api/entity/preference', '/api/entity/comments', '/api/account/settings',
            '/api/addons/install', '/api/addons/toggle', '/api/addons/uninstall'] as $route) {
            $this->postJson($route, [])->assertUnauthorized();
        }
    }

    public function test_guest_cannot_read_private_library_addons_or_obtain_service_session(): void
    {
        foreach (['/api/account/library?view=bookmarks', '/api/addons', '/api/service/session'] as $route) {
            $this->getJson($route)->assertUnauthorized();
        }
    }
}
