# Dépannage

Les problèmes que l'on rencontre en installant KROMA, avec leur cause et leur
solution. Chaque titre décrit ce que vous voyez. Commencez par lire le journal
du serveur : il nomme en général le problème.

## Lire le journal du serveur

- **Dans KROMA** : **Serveur** > **Journaux**.
- **Docker** : `docker compose logs kroma`, dans le dossier du fichier compose.
  Ajoutez `-f` pour le suivre en direct.
- **Paquet Synology** : `/var/packages/kroma/var/kroma.log`, en SSH.
- **Container Manager, QNAP, Unraid, TrueNAS** : le journal du conteneur
  `kroma`, dans le gestionnaire d'applications.

Pour plus de détails, définissez `RUST_LOG=debug` et redémarrez KROMA. Retirez-la
ensuite : le journal de débogage grossit vite.

## Trouver l'adresse du serveur

L'adresse du serveur sur votre réseau est un nombre comme `192.168.1.50`.

- **Sur un NAS** : l'adresse avec laquelle vous ouvrez sa page
  d'administration.
- **Sur Linux** : exécutez `hostname -I`. Le premier nombre est en général le
  bon.
- **Sur un Mac** : **Réglages Système** > **Wi-Fi** ou **Réseau** >
  **Détails**.
- **Dans votre routeur** : la liste des appareils connectés affiche toutes les
  adresses.

KROMA se trouve à cette adresse, sur le port `4040` :
`http://192.168.1.50:4040`.

## La page web ne s'ouvre pas

1. Vérifiez que le serveur est en marche :
   - Docker : `docker compose ps` affiche `kroma` avec l'état `running`.
   - Paquet Synology : le **Centre de paquets** affiche KROMA avec l'état
     **En cours d'exécution**.
2. Vérifiez l'adresse. Elle commence par `http://`, et non par `https://`, et
   se termine par `:4040`.
3. Ouvrez `http://SERVER_IP:4040/api/health` dans le navigateur. S'il répond
   `"status":"ok"`, le serveur fonctionne et le problème vient du navigateur :
   videz son cache, ou essayez un autre navigateur.
4. Vérifiez le pare-feu de la machine qui fait tourner KROMA. Il doit
   autoriser le port TCP `4040` :
   - Synology : **Panneau de configuration** > **Sécurité** > **Pare-feu** >
     **Modifier les règles**.
   - Linux avec ufw : `sudo ufw allow 4040/tcp`.

## `Le compte propriétaire se crée depuis le réseau local du serveur`

Vous avez ouvert KROMA par une adresse extérieure à votre réseau, par exemple
un tunnel ou un nom de domaine. Le premier compte ne peut être créé que depuis
chez vous. Ouvrez KROMA avec son adresse locale, par exemple
`http://192.168.1.50:4040`, depuis un appareil connecté au même réseau.

## Une bibliothèque reste vide après une analyse

KROMA ne voit pas le dossier, ne peut pas le lire, ou ne reconnaît pas les
fichiers qu'il contient.

1. Lisez le journal après une analyse. Deux avertissements signalent ce
   problème : `entries skipped`, suivi du dossier et d'un fichier que KROMA n'a
   pas pu ouvrir, et `configured libraries produced no items`.
2. Vérifiez que le dossier existe là où KROMA le cherche :
   - Docker : le dossier de la bibliothèque doit être le chemin à l'intérieur
     du conteneur, par exemple `/media/Films`. Affichez son contenu depuis
     l'intérieur du conteneur :

     ```bash
     docker compose exec kroma ls /media
     ```

     Une réponse vide signifie que le dossier n'est pas monté. Vérifiez les
     lignes `volumes:` du fichier compose.
   - Paquet Synology : le chemin commence par `/volume1/`, ou par le numéro de
     votre volume.
3. Donnez à KROMA l'accès en lecture au dossier :
   - Paquet Synology : [donnez l'accès à l'utilisateur `kroma`](synology.md#donner-à-kroma-laccès-à-vos-médias),
     puis redémarrez KROMA.
   - Docker : l'utilisateur indiqué dans `user:` doit pouvoir lire le dossier.
     Consultez [Docker](docker.md#monter-vos-dossiers-de-médias).
4. Vérifiez le nom des fichiers. Consultez
   [Nommer vos fichiers](media-folders.md#nommer-vos-fichiers).
5. Sous **Serveur** > **Sources**, sélectionnez **Analyser** sur la
   bibliothèque.

## Un film affiche le mauvais titre ou la mauvaise affiche

KROMA a choisi la mauvaise correspondance à partir du nom du fichier. Connecté
avec le compte propriétaire, ouvrez le film, choisissez **Corriger la fiche**,
cherchez le bon titre, puis sélectionnez **Utiliser ce titre**.
Pour l'éviter, nommez le dossier avec le titre et l'année :
`Blade Runner 2049 (2017)`.

## Un téléviseur ou une application ne trouve pas le serveur

Les applications cherchent un serveur sur le port `4040` dans votre réseau
domestique. La recherche échoue quand :

- l'appareil est sur un autre réseau que le serveur, par exemple un Wi-Fi
  invité, un réseau séparé pour les téléviseurs, ou les données mobiles ;
- votre Wi-Fi isole les appareils les uns des autres, une option que certains
  routeurs appellent **AP isolation** ou **client isolation** ;
- KROMA utilise un autre port que `4040`.

Dans chaque cas, saisissez l'adresse dans l'application :
`http://SERVER_IP:4040`. Si cela échoue aussi, ouvrez la même adresse dans un
navigateur sur ce réseau, pour vérifier que le serveur est joignable depuis
celui-ci. Pour accéder à KROMA hors de chez vous, consultez
[HTTPS, reverse proxy et accès distant](network.md).

## Un film ne se lit pas, ou s'arrête pour charger

Un écran qui ne peut pas lire un fichier demande au serveur de le convertir.
Sans puce graphique, une conversion en 4K peut être trop lente pour le serveur.

1. Lisez le journal pendant que le film démarre. Il indique si le serveur
   convertit la vidéo, et avec quel matériel.
2. Configurez le [transcodage matériel](hardware-transcoding.md) si le serveur
   a une puce graphique.
3. Essayez le film sur un autre appareil. S'il s'y lit, le premier appareil a
   besoin d'une conversion que le serveur ne peut pas suivre.

Si le lecteur indique que le serveur est occupé, trop de conversions tournent
en même temps. Consultez `KROMA_MAX_TRANSCODES` dans la
[référence de configuration](configuration.md#transcodage).

## Signaler un problème

Si cette page ne résout pas votre problème,
[ouvrez un ticket](https://github.com/kromatv/kroma/issues) avec :

- la version de KROMA : dans l'application web, sélectionnez le numéro de
  version en bas du menu, ce qui le copie ;
- la façon dont vous avez installé le serveur : Docker, paquet Synology ou
  autre NAS ;
- l'appareil et son modèle, pour un problème de lecture ;
- ce que vous avez fait, ce que vous attendiez, et ce qui s'est passé à la
  place ;
- les lignes du journal du serveur à ce moment-là.

Le journal peut contenir des adresses de votre réseau. Retirez ce que vous ne
voulez pas partager avant de le publier.
