<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class AccountExperience
{
    public function read(User $user, array $completion): array
    {
        $rules = json_decode(file_get_contents(resource_path('data/experience-rules.json')), true, flags: JSON_THROW_ON_ERROR);
        $social = DB::table('user_entity_preferences as p')->join('catalog_entities as e', 'e.id', '=', 'p.entity_id')
            ->where('p.user_id', $user->id)->whereColumn('p.target_type', 'e.kind')->where('e.resolution_status', 'verified')
            ->selectRaw('count(distinct case when p.liked=1 then p.entity_id end) as likes, count(distinct case when p.bookmarked=1 then p.entity_id end) as bookmarks, count(distinct case when p.user_score>0 then p.entity_id end) as ratings')->first();
        $comments = DB::table('entity_discussions as d')->join('catalog_entities as e', 'e.id', '=', 'd.entity_id')
            ->where('d.user_id', $user->id)->whereColumn('d.target_type', 'e.kind')->where('e.resolution_status', 'verified')->distinct()->count('d.entity_id');
        $total = max(0, (int) $user->active_minutes) * $rules['presence']['minute'] + max(0, (int) $user->streak_xp);
        $total += $social->likes * $rules['social']['like'] + $social->bookmarks * $rules['social']['bookmark']
            + $social->ratings * $rules['social']['rating'] + $comments * $rules['social']['comment'];
        foreach ($rules['catalog'] as $kind => $weight) {
            $total += $completion['counts'][$kind] * $weight;
        }
        $remaining = $total;
        $level = 1;
        while ($remaining >= floor($rules['curve']['base'] * $level ** $rules['curve']['exponent'])) {
            $remaining -= floor($rules['curve']['base'] * $level ** $rules['curve']['exponent']);
            $level++;
        }

        return ['total' => $total, 'level' => $level];
    }
}
