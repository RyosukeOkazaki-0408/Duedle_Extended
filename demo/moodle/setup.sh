#!/bin/bash
# Run only on the dedicated Debian 12 demo VM: sudo bash setup.sh [hostname]
set -euo pipefail
DEMO_INSTALLER_VERSION=2026-10-26-recovery-1
if [[ ${1:-} == --version ]]; then
    echo "$DEMO_INSTALLER_VERSION"
    exit 0
fi
echo "Duedle Moodle installer: $DEMO_INSTALLER_VERSION"
trap 'echo "Setup stopped at line $LINENO. Fix the reported error, then rerun the same command." >&2' ERR
[[ $EUID == 0 ]] || { echo 'Run with sudo bash setup.sh'; exit 1; }
. /etc/os-release
[[ $ID == debian && $VERSION_ID == 12 ]] || { echo 'This installer requires Debian 12.'; exit 1; }
DEMO_SOURCE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DEMO_ROOT=/opt/duedle-moodle-demo
DEMO_WEB=$DEMO_ROOT/www/moodle40a
DEMO_REVISION=cae172ee4aeec1d7a6eaba7bb5ae12a5f0fe3772
[[ -f $DEMO_SOURCE/seed.php && -f $DEMO_SOURCE/finish_install.php && -d $DEMO_SOURCE/plugins/local/duedledemo ]] || {
    echo 'Extract the complete demo bundle first.'; exit 1;
}
install -d -m 755 "$DEMO_ROOT"
if [[ ! -f $DEMO_ROOT/instance.env ]]; then
    [[ ! -e $DEMO_WEB && ! -e $DEMO_ROOT/data ]] || {
        echo 'Existing unowned demo files found; refusing to overwrite them.'; exit 1;
    }
    DEMO_IP=$(curl --fail --silent --show-error --max-time 10 -H 'Metadata-Flavor: Google' \
        http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)
    [[ $DEMO_IP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'No external IPv4 address found.'; exit 1; }
    DEMO_HOST=${1:-duedle-${DEMO_IP//./-}.sslip.io}
    [[ $DEMO_HOST =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || { echo 'Invalid hostname.'; exit 1; }
    umask 077
    {
        printf 'DEMO_HOST=%q\n' "$DEMO_HOST"
        printf 'DEMO_DB_PASSWORD=%q\n' "$(openssl rand -hex 24)"
        printf 'DEMO_ADMIN_PASSWORD=%q\n' "Aa1!$(openssl rand -hex 16)"
        printf 'DEMO_STUDENT_PASSWORD=%q\n' "Aa1!$(openssl rand -hex 12)"
    } > "$DEMO_ROOT/instance.env"
    umask 022
fi
. "$DEMO_ROOT/instance.env"
[[ $# == 0 || $1 == "$DEMO_HOST" ]] || { echo 'Hostname differs from the existing installation.'; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y apache2 postgresql git curl ca-certificates unzip \
    php8.2 libapache2-mod-php8.2 php8.2-cli php8.2-pgsql php8.2-curl php8.2-gd \
    php8.2-intl php8.2-mbstring php8.2-soap php8.2-xml php8.2-zip php8.2-bcmath \
    certbot python3-certbot-apache
systemctl enable --now postgresql apache2
# Fail before copying an incomplete plugin into Moodle's discovered plugin tree.
for plugin in "$DEMO_SOURCE"/plugins/blocks/*; do
    name=$(basename "$plugin")
    [[ -f $plugin/version.php && -f $plugin/block_$name.php && -f $plugin/lang/en/block_$name.php ]] || {
        echo "Incomplete block plugin: $name"; exit 1;
    }
done
while IFS= read -r -d '' phpfile; do php -l "$phpfile"; done < <(find "$DEMO_SOURCE" -type f -name '*.php' -print0)
install -d -m 755 "$DEMO_ROOT/www" "$DEMO_ROOT/tools"
if [[ ! -d $DEMO_WEB/.git ]]; then
    [[ ! -e $DEMO_WEB ]] || { echo 'Existing Moodle source found; refusing to overwrite it.'; exit 1; }
    git init "$DEMO_WEB"
    git -C "$DEMO_WEB" remote add origin https://github.com/moodle/moodle.git
    git -C "$DEMO_WEB" fetch --depth 1 origin "$DEMO_REVISION"
    git -C "$DEMO_WEB" checkout --detach FETCH_HEAD
fi
[[ $(git -C "$DEMO_WEB" rev-parse HEAD) == "$DEMO_REVISION" ]] || { echo 'Unexpected Moodle revision.'; exit 1; }
cp -a "$DEMO_SOURCE/plugins/local/duedledemo" "$DEMO_WEB/local/"
cp -a "$DEMO_SOURCE/plugins/blocks/duedledemo" "$DEMO_WEB/blocks/"
cp -a "$DEMO_SOURCE/plugins/blocks/syllabus" "$DEMO_WEB/blocks/"
install -d "$DEMO_WEB/course/mycourse_config" "$DEMO_WEB/blocks/syllabus"
install -m 644 "$DEMO_SOURCE/routes/reorder.php" "$DEMO_WEB/course/mycourse_config/reorder.php"
install -m 644 "$DEMO_SOURCE/routes/syllabus.php" "$DEMO_WEB/blocks/syllabus/view.php"
install -m 644 "$DEMO_SOURCE/seed.php" "$DEMO_ROOT/tools/seed.php"
install -m 644 "$DEMO_SOURCE/finish_install.php" "$DEMO_ROOT/tools/finish_install.php"
cp -a "$DEMO_SOURCE/files" "$DEMO_ROOT/tools/"
install -d -o www-data -g www-data -m 770 "$DEMO_ROOT/data"
for phpini in /etc/php/8.2/apache2/conf.d/99-duedle-demo.ini /etc/php/8.2/cli/conf.d/99-duedle-demo.ini; do
    cat > "$phpini" <<'INI'
memory_limit = 256M
max_input_vars = 5000
upload_max_filesize = 10M
post_max_size = 12M
date.timezone = Asia/Tokyo
expose_php = Off
INI
done
if [[ ! -f $DEMO_ROOT/database-created ]]; then
    if runuser -u postgres -- psql -Atc "SELECT 1 FROM pg_roles WHERE rolname='duedledemo'" | grep -q 1 \
        || runuser -u postgres -- psql -Atc "SELECT 1 FROM pg_database WHERE datname='duedledemo'" | grep -q 1; then
        echo 'An existing duedledemo database/role was found. Refusing to modify it.'; exit 1
    fi
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 --set=dbpass="$DEMO_DB_PASSWORD" <<'SQL'
CREATE ROLE duedledemo LOGIN PASSWORD :'dbpass';
CREATE DATABASE duedledemo OWNER duedledemo ENCODING 'UTF8' TEMPLATE template0;
SQL
    touch "$DEMO_ROOT/database-created"
fi
if [[ ! -f $DEMO_WEB/config.php ]]; then
    cat > "$DEMO_WEB/config.php" <<PHP
<?php
unset(\$CFG);
global \$CFG;
\$CFG = new stdClass();
\$CFG->dbtype = 'pgsql';
\$CFG->dblibrary = 'native';
\$CFG->dbhost = '127.0.0.1';
\$CFG->dbname = 'duedledemo';
\$CFG->dbuser = 'duedledemo';
\$CFG->dbpass = '$DEMO_DB_PASSWORD';
\$CFG->prefix = 'mdl_';
\$CFG->dboptions = ['dbpersist' => false, 'dbport' => 5432, 'dbsocket' => ''];
\$CFG->wwwroot = 'https://$DEMO_HOST/moodle40a';
\$CFG->dataroot = '$DEMO_ROOT/data';
\$CFG->admin = 'admin';
\$CFG->directorypermissions = 02770;
\$CFG->noemailever = true;
\$CFG->disablestatsprocessing = true;
require_once(__DIR__ . '/lib/setup.php');
PHP
    chown root:www-data "$DEMO_WEB/config.php"
    chmod 640 "$DEMO_WEB/config.php"
fi
cat > /etc/apache2/sites-available/duedle-moodle-demo.conf <<APACHE
<VirtualHost *:80>
    ServerName $DEMO_HOST
    DocumentRoot $DEMO_ROOT/www
    <Directory $DEMO_ROOT/www>
        Require all granted
        AllowOverride None
        Options -Indexes +FollowSymLinks
        DirectoryIndex index.php index.html
    </Directory>
    ErrorLog \${APACHE_LOG_DIR}/duedle-demo-error.log
    CustomLog \${APACHE_LOG_DIR}/duedle-demo-access.log combined
</VirtualHost>
APACHE
a2ensite duedle-moodle-demo
apache2ctl configtest
systemctl restart apache2
if [[ ! -f /etc/letsencrypt/live/$DEMO_HOST/fullchain.pem ]]; then
    certbot --apache --non-interactive --agree-tos --register-unsafely-without-email \
        --redirect -d "$DEMO_HOST"
fi
# A failed plugin installation already has core tables. Resume its plugins and
# finish only the still-pending admin/site initialization; never drop the DB.
if [[ ! -f $DEMO_ROOT/moodle-installed ]]; then
    core_exists=$(runuser -u postgres -- psql -d duedledemo -Atc "SELECT to_regclass('public.mdl_config') IS NOT NULL")
    if [[ $core_exists == t ]]; then
        runuser -u www-data -- php "$DEMO_WEB/admin/cli/upgrade.php" --non-interactive
        runuser -u www-data -- env DEMO_ADMIN_PASSWORD="$DEMO_ADMIN_PASSWORD" php "$DEMO_ROOT/tools/finish_install.php"
    else
        runuser -u www-data -- php "$DEMO_WEB/admin/cli/install_database.php" --agree-license \
            --adminuser=admin --adminpass="$DEMO_ADMIN_PASSWORD" --adminemail=admin@example.com \
            --fullname='Duedle Demo Moodle' --shortname='Duedle Demo'
    fi
    touch "$DEMO_ROOT/moodle-installed"
fi
php -l "$DEMO_ROOT/tools/seed.php"
runuser -u www-data -- env DEMO_STUDENT_PASSWORD="$DEMO_STUDENT_PASSWORD" php "$DEMO_ROOT/tools/seed.php"
cat > /etc/cron.d/duedle-moodle-demo <<CRON
* * * * * www-data /usr/bin/php $DEMO_WEB/admin/cli/cron.php > /dev/null 2>&1
CRON
chmod 644 /etc/cron.d/duedle-moodle-demo
printf '\nMoodle URL: https://%s/moodle40a/\nStudent username: reviewer\nStudent password: %s\nAdmin username: admin\nAdmin password: %s\n' \
    "$DEMO_HOST" "$DEMO_STUDENT_PASSWORD" "$DEMO_ADMIN_PASSWORD"
echo 'Credentials are also saved in /opt/duedle-moodle-demo/instance.env (root only).'
echo 'Moodle installation finished. Duedle extension integration still requires configuring this exact hostname.'
