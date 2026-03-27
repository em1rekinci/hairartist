<?php
/**
 * PayTR iFrame Token Endpoint
 * Hair Artist — hairartist.com.tr
 *
 * Bu dosyayı sunucunuzda /api/paytr-token adresine yerleştirin.
 * (Örn: /var/www/html/api/paytr-token.php veya Next.js/Node için ayrı uyarlama yapın)
 *
 * PayTR Mağaza Paneli > Bilgi sayfasından aşağıdaki değerleri alın.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: https://hairartist.com.tr'); // Güvenlik için domain kısıtlayın
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'fail', 'reason' => 'Method not allowed']);
    exit;
}

// ─── PAYTR BİLGİLERİNİZİ GİRİN ────────────────────────────────────────────
define('PAYTR_MERCHANT_ID',   'XXXXXXX');         // PayTR Mağaza No
define('PAYTR_MERCHANT_KEY',  'XXXXXXXXXXXXXXXX'); // API Anahtarı
define('PAYTR_MERCHANT_SALT', 'XXXXXXXXXXXXXXXX'); // Gizli Anahtar

define('PAYTR_OK_URL',   'https://hairartist.com.tr/odeme-basarili'); // Ödeme başarılı URL
define('PAYTR_FAIL_URL', 'https://hairartist.com.tr/odeme-basarisiz'); // Ödeme hatalı URL
// ───────────────────────────────────────────────────────────────────────────

// Gelen JSON verisini oku
$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['status' => 'fail', 'reason' => 'Geçersiz istek']);
    exit;
}

$ad      = trim($input['ad']      ?? '');
$telefon = trim($input['telefon'] ?? '');
$hizmet  = trim($input['hizmet']  ?? '');
$tarih   = trim($input['tarih']   ?? '');
$saat    = trim($input['saat']    ?? '');
$fiyat   = intval($input['fiyat'] ?? 0);

if (!$ad || !$telefon || !$hizmet || $fiyat <= 0) {
    http_response_code(400);
    echo json_encode(['status' => 'fail', 'reason' => 'Eksik bilgi']);
    exit;
}

// Ad Soyad ayrıştır
$adParcalari = explode(' ', $ad, 2);
$isim  = $adParcalari[0];
$soyad = $adParcalari[1] ?? '-';

// Telefon normalize et (905xxxxxxxxx formatına)
$tel = preg_replace('/\D/', '', $telefon);
if (str_starts_with($tel, '0')) $tel = substr($tel, 1);
if (!str_starts_with($tel, '90')) $tel = '90' . $tel;

// PayTR tutarı kuruş cinsinden (örn: 250 TL → 25000)
$tutar_kurus = $fiyat * 100;

// Sipariş no: benzersiz
$merchant_oid = 'HA' . date('ymdHis') . rand(100, 999);

// Kullanıcı IP
$user_ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'];
$user_ip = explode(',', $user_ip)[0];

// Sepet (JSON, base64)
$sepet = json_encode([
    [$hizmet . ' (' . $tarih . ' ' . $saat . ')', number_format($fiyat, 2, '.', ''), 1]
]);
$user_basket = base64_encode($sepet);

// Diğer PayTR parametreleri
$no_installment  = 0; // 1 = taksit kapalı
$max_installment = 0; // 0 = tüm taksitler
$currency        = 'TL';
$test_mode       = 0; // 0 = canlı, 1 = test
$lang            = 'tr';
$debug_on        = 0;
$timeout_limit   = 30;

// Hash hesapla
$hash_str = PAYTR_MERCHANT_ID
    . $user_ip
    . $merchant_oid
    . 'musteri@hairartist.com.tr' // Müşteri e-posta (sabit ya da dinamik)
    . $tutar_kurus
    . $user_basket
    . $no_installment
    . $max_installment
    . $currency
    . $test_mode
    . PAYTR_MERCHANT_SALT;

$paytr_token = base64_encode(hash_hmac('sha256', $hash_str, PAYTR_MERCHANT_KEY, true));

// PayTR API'ye POST
$post_params = [
    'merchant_id'       => PAYTR_MERCHANT_ID,
    'user_ip'           => $user_ip,
    'merchant_oid'      => $merchant_oid,
    'email'             => 'musteri@hairartist.com.tr',
    'payment_amount'    => $tutar_kurus,
    'paytr_token'       => $paytr_token,
    'user_basket'       => $user_basket,
    'debug_on'          => $debug_on,
    'no_installment'    => $no_installment,
    'max_installment'   => $max_installment,
    'user_name'         => $isim . ' ' . $soyad,
    'user_address'      => 'İstanbul',
    'user_phone'        => $tel,
    'merchant_ok_url'   => PAYTR_OK_URL,
    'merchant_fail_url' => PAYTR_FAIL_URL,
    'timeout_limit'     => $timeout_limit,
    'currency'          => $currency,
    'test_mode'         => $test_mode,
    'lang'              => $lang,
];

$ch = curl_init('https://www.paytr.com/odeme/api/get-token');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $post_params,
    CURLOPT_FRESH_CONNECT  => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$result = curl_exec($ch);
$curl_error = curl_error($ch);
curl_close($ch);

if ($curl_error) {
    error_log('PayTR cURL hatası: ' . $curl_error);
    echo json_encode(['status' => 'fail', 'reason' => 'Bağlantı hatası']);
    exit;
}

$result_arr = json_decode($result, true);

if ($result_arr['status'] === 'success') {
    echo json_encode([
        'status' => 'success',
        'token'  => $result_arr['token']
    ]);
} else {
    error_log('PayTR hatası: ' . ($result_arr['reason'] ?? $result));
    echo json_encode([
        'status' => 'fail',
        'reason' => $result_arr['reason'] ?? 'Token alınamadı'
    ]);
}
