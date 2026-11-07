<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;

class AuditBladeViewsCommand extends Command
{
    protected $signature = 'audit:blade-views';
    protected $description = 'Audita todas as views Blade para detectar cores hardcoded e textos sem data-i18n';

    public function handle(): int
    {
        $dir = resource_path('views');
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));
        $bladeFiles = [];

        foreach ($files as $file) {
            if ($file->isFile() && str_ends_with($file->getFilename(), '.blade.php')) {
                $bladeFiles[] = $file->getPathname();
            }
        }

        $this->info("Auditando " . count($bladeFiles) . " arquivos Blade...");

        $totalColorIssues = 0;
        $totalTextIssues = 0;

        foreach ($bladeFiles as $filePath) {
            $relPath = str_replace(resource_path('views'), '', $filePath);
            $content = file_get_contents($filePath);

            // 1. Verificar cores Tailwind não-tokenizadas (ex: bg-slate-900, text-white, border-slate-700)
            preg_match_all('/\b(bg|text|border)-(slate|zinc|neutral|stone|gray|amber|emerald|rose|blue|purple|indigo)-[0-9]{2,3}\b/', $content, $colorMatches);
            $hardcodedColors = array_unique($colorMatches[0] ?? []);

            // 2. Verificar tags com texto visível sem data-i18n (ex: <span>Texto</span> sem data-i18n)
            preg_match_all('/<([a-z1-6]+)(?![^>]*data-i18n)[^>]*>([A-Za-zÀ-ú0-9\s\.,!\?:;]{3,})<\/\1>/u', $content, $textMatches);
            $rawTexts = [];
            foreach ($textMatches[2] as $txt) {
                $clean = trim($txt);
                // Ignorar expressões blade {{ }}, SVGs ou números puros
                if (str_starts_with($clean, '{{') || str_starts_with($clean, '@') || is_numeric($clean) || strlen($clean) < 3) {
                    continue;
                }
                $rawTexts[] = $clean;
            }
            $rawTexts = array_unique($rawTexts);

            if (!empty($hardcodedColors) || !empty($rawTexts)) {
                $this->warn("\n[ARQUIVO] {$relPath}");
                if (!empty($hardcodedColors)) {
                    $totalColorIssues += count($hardcodedColors);
                    $this->line("   🎨 Cores Tailwind fixas (" . count($hardcodedColors) . "): " . implode(', ', array_slice($hardcodedColors, 0, 8)));
                }
                if (!empty($rawTexts)) {
                    $totalTextIssues += count($rawTexts);
                    $this->line("   🔤 Textos sem data-i18n (" . count($rawTexts) . "): " . implode(' | ', array_slice($rawTexts, 0, 5)));
                }
            }
        }

        $this->info("\n=== RESUMO DA AUDITORIA ===");
        $this->info("Total de ocorrências de cores fixas: {$totalColorIssues}");
        $this->info("Total de textos sem atributo data-i18n: {$totalTextIssues}");

        return 0;
    }
}
