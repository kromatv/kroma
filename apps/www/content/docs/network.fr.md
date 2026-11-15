# HTTPS, reverse proxy et accès distant

Sur votre réseau local, KROMA répond en HTTP non chiffré, sur le port `4040`, et
ne demande aucune configuration. Cette page couvre le reste : regarder hors de
chez vous, placer KROMA derrière votre propre nom de domaine et activer HTTPS.

## Regarder hors de chez vous

Votre téléphone en données mobiles, ou un téléviseur chez un ami, ne peut pas
joindre une adresse comme `192.168.1.50`. Pour joindre KROMA depuis Internet,
choisissez l'une de ces solutions :

| Solution | Prérequis | Idéale pour |
| --- | --- | --- |
| [Module Accès distant](#avec-le-module-accès-distant) | un compte Cloudflare gratuit et un domaine sur Cloudflare | la plupart des gens : aucun port à ouvrir sur votre routeur |
| [Votre propre reverse proxy](#derrière-votre-propre-reverse-proxy) | un nom de domaine, un reverse proxy comme Caddy ou nginx, le port 443 ouvert sur votre routeur | ceux qui en utilisent déjà un |
| Un VPN vers votre domicile, comme WireGuard ou Tailscale | l'app VPN sur chaque appareil | ceux qui ne veulent pas du tout de KROMA sur Internet |

> [!WARNING]
> Ne redirigez pas le port `4040` de votre routeur vers KROMA. En HTTP non
> chiffré, votre mot de passe et votre session traversent Internet en clair.
> Utilisez l'une des solutions ci-dessus : toutes chiffrent la connexion.

### Avec le module Accès distant

Le module **Accès distant** publie KROMA à l'adresse HTTPS de votre choix grâce
à un Cloudflare Tunnel, sans aucun port à ouvrir sur votre routeur.

1. Créez un tunnel dans le tableau de bord Cloudflare et copiez son jeton de
   connecteur. Le
   [guide des tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/)
   de Cloudflare explique comment faire. Faites pointer son nom d'hôte public,
   par exemple `kroma.example.com`, vers `http://localhost:4040`.
2. Dans KROMA, ouvrez **Serveur** > **Modules** et installez **Accès distant**.
3. Ouvrez **Serveur** > **Accès distant**.
4. Dans **URL personnalisée**, saisissez `https://kroma.example.com`.
5. Sous **Connecteur géré (Cloudflare Tunnel)**, activez
   **Activer l'accès distant**, collez le jeton dans **Jeton du tunnel**, puis
   sélectionnez **Enregistrer**.

KROMA démarre le connecteur et affiche **Connecté**. Si vous gérez déjà un
tunnel vous-même, laissez **Activer l'accès distant** désactivé et renseignez
seulement **URL personnalisée**.

### Derrière votre propre reverse proxy

Faites pointer le proxy vers `http://SERVER_IP:4040`. Indiquez ensuite à KROMA
son adresse publique, pour que les liens qu'il envoie, comme la réinitialisation
du mot de passe et la connexion d'un téléviseur, l'utilisent : renseignez
**URL personnalisée** dans **Serveur** > **Accès distant**, ou définissez
`KROMA_WEB_URL`, que les liens d'invitation utilisent aussi.

KROMA ne lit l'adresse réelle du visiteur dans `X-Forwarded-For` que si la
requête vient d'un proxy de confiance. Un proxy sur le même ordinateur est
toujours de confiance, sauf si KROMA tourne dans Docker : un proxy sur l'hôte
atteint alors le conteneur par le réseau de Docker, comme un proxy situé
ailleurs. Un tel proxy, dans un autre conteneur ou sur une autre machine, doit
être déclaré :

```bash
KROMA_TRUSTED_PROXIES="172.18.0.0/16"
```

Indiquez l'adresse du proxy lui-même, ou la plage de son réseau Docker.
Séparez-en plusieurs par des virgules.

> [!IMPORTANT]
> Sans ce réglage, KROMA prend chaque visiteur pour le proxy. Deux choses ne
> fonctionnent alors plus : la connexion d'un téléviseur depuis un téléphone
> considère tout le monde comme un seul réseau, et la protection contre les
> tentatives de mot de passe compte tout le monde comme un seul visiteur. Ne
> déclarez que le proxy : toute adresse de la liste peut se faire passer pour
> n'importe qui.

Le proxy doit ajouter l'adresse du visiteur à la fin de `X-Forwarded-For`, sans
remplacer l'en-tête. Caddy et Traefik le font par défaut. Dans nginx :

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

KROMA lit aussi `CF-Connecting-IP`, envoyé par Cloudflare, quand la requête
n'a pas d'en-tête `X-Forwarded-For`.

### En IPv6

Avec IPv6, l'ordinateur qui fait tourner KROMA a sa propre adresse publique :
votre routeur n'a aucun port à rediriger. La plupart des routeurs bloquent
quand même les connexions qui viennent d'Internet. Autorisez-les dans le
pare-feu IPv6 du routeur, uniquement vers l'adresse de cet ordinateur.

IPv6 ne remplace pas HTTPS. Gardez un reverse proxy devant KROMA et autorisez
le port `443` vers lui, jamais le port `4040`. Dans le DNS de votre nom de
domaine, ajoutez un enregistrement `AAAA` avec l'adresse IPv6 du proxy.

Un appareil ne joint cette adresse que depuis un réseau qui a lui aussi IPv6.
C'est le cas de la plupart des réseaux mobiles. Beaucoup de réseaux
d'entreprise et d'hôtel ne l'ont pas.

KROMA lui-même écoute en IPv4. Un reverse proxy sur le même ordinateur n'a
besoin de rien d'autre, car il joint KROMA à `http://127.0.0.1:4040`. Pour que
KROMA réponde aussi en IPv6, définissez `KROMA_HOST` :

```bash
KROMA_HOST="::"
```

Chez vous, KROMA considère un appareil comme local quand il est dans le même
réseau IPv6 que le serveur, le même `/64`. Si votre domicile compte plusieurs
réseaux IPv6, ajoutez leurs plages, par exemple `2001:db8:1::/56`, à
**Réseaux locaux autorisés** dans **Serveur** > **Réseau** > **Réglages**.

## Activer HTTPS sur votre réseau local

Les navigateurs n'autorisent les clés d'accès, et quelques autres fonctions de
sécurité, que sur une adresse HTTPS ou sur `localhost`. Pour les utiliser à une
adresse comme `http://192.168.1.50:4040`, KROMA peut aussi servir HTTPS avec un
certificat qu'il crée lui-même.

1. Définissez `KROMA_HTTPS=1`. Dans Docker, publiez aussi le port `4443` :

   ```yaml
       ports:
         - "4040:4040"
         - "4443:4443"
       environment:
         KROMA_HTTPS: "1"
         KROMA_TLS_SANS: "192.168.1.50,nas.home"
   ```

2. Indiquez dans `KROMA_TLS_SANS` chaque adresse que vous utilisez pour ouvrir
   KROMA. Hors de Docker, KROMA trouve seul l'adresse et le nom de
   l'ordinateur. Dans Docker, il ne le peut pas : indiquez-les.
3. Redémarrez KROMA, puis ouvrez `https://192.168.1.50:4443`.
4. Le navigateur avertit que le certificat n'est pas fiable, parce que KROMA
   l'a créé. Pour lui faire confiance sur un appareil, téléchargez-le depuis
   `http://192.168.1.50:4040/api/tls/cert.pem` et installez-le sur cet
   appareil.

Le HTTP sur le port `4040` continue de fonctionner. Les apps TV continuent de
l'utiliser, car beaucoup de téléviseurs ne peuvent pas faire confiance à un
certificat que vous avez créé.

KROMA conserve le certificat dans son dossier de données, sous `tls`. Après
avoir modifié `KROMA_TLS_SANS`, supprimez ce dossier et redémarrez : KROMA en
crée un nouveau.

Pour rediriger chaque visiteur HTTP vers HTTPS, définissez aussi
`KROMA_HTTPS_REDIRECT=1`. Laissez ce réglage désactivé si vous utilisez une app
TV.

## Servir l'application web depuis une autre adresse

Un navigateur ne laisse une page lire les réponses de KROMA que si la page vient
d'une adresse à laquelle KROMA fait confiance : KROMA lui-même, votre réseau
local, `tv.kroma.tv`, l'adresse de `KROMA_WEB_URL`, et l'adresse HTTPS à
laquelle un proxy de confiance sert KROMA. Les apps pour téléphones,
téléviseurs et ordinateurs ne sont pas concernées.

Si vous hébergez vous-même un client web KROMA à une autre adresse, ajoutez-la :

```bash
KROMA_ALLOWED_ORIGINS="https://kroma.example"
```

Chaque adresse de cette liste peut agir comme un client connecté à votre
serveur : n'indiquez que des adresses que vous contrôlez.
