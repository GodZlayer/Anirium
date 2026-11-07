<?php

namespace App\Support;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class CatalogDatabaseRetry
{
    public function run(callable $operation, int $attempts = 6): mixed
    {
        $attempt = 1;
        while (true) {
            try {
                return $operation();
            } catch (QueryException $exception) {
                if ($attempt >= $attempts || DB::connection($exception->getConnectionName())->getDriverName() !== 'sqlite'
                    || ! in_array((int) ($exception->errorInfo[1] ?? 0), [5, 6], true)) {
                    throw $exception;
                }
                $this->pause($attempt++);
            }
        }
    }

    protected function pause(int $attempt): void
    {
        usleep(min(2000000, 200000 * (2 ** ($attempt - 1))));
    }
}
