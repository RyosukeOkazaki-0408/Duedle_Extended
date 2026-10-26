<?php
// Resume only the post-plugin steps of this demo's interrupted CLI install.
// Sequence follows Moodle lib/installlib.php::install_cli_database (GPL-3.0-or-later).
define('CLI_SCRIPT', true);
require('/opt/duedle-moodle-demo/www/moodle40a/config.php');
require_once($CFG->libdir . '/adminlib.php');
require_once($CFG->libdir . '/upgradelib.php');
$password = getenv('DEMO_ADMIN_PASSWORD');
if (!$password) { throw new RuntimeException('The existing demo admin password is required.'); }
$admin = get_admin();
if (!$admin) { throw new RuntimeException('Core admin is missing; this is not a resumable plugin-install failure.'); }
if ($admin->password !== 'adminsetuppending') {
    if (!get_config('core', 'rolesactive')) {
        throw new RuntimeException('An unexpected configured admin was found. Its credentials will not be changed.');
    }
    echo "Site was already configured; existing admin credentials preserved.\n";
    exit(0);
}
$transaction = $DB->start_delegated_transaction();
$DB->set_field('user', 'password', hash_internal_user_password($password), ['id' => $admin->id]);
$DB->set_field('user', 'email', 'admin@example.com', ['id' => $admin->id]);
set_config('supportemail', 'admin@example.com');
set_config('rolesactive', 1);
\core\session\manager::set_user(get_admin());
admin_apply_default_settings(null, true);
set_config('registerauth', '');
$DB->set_field('course', 'shortname', 'Duedle Demo', ['format' => 'site']);
$DB->set_field('course', 'fullname', 'Duedle Demo Moodle', ['format' => 'site']);
set_config('registrationpending', 0);
$transaction->allow_commit();
upgrade_finished();
echo "Completed the interrupted demo installation without recreating the database.\n";
