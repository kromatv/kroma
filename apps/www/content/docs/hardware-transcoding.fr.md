# Transcodage matériel

La plupart du temps, KROMA envoie un fichier vidéo à l'écran tel quel. C'est ce
qu'on appelle la lecture directe, et cela ne coûte presque rien au serveur.
KROMA ne convertit une vidéo que si l'écran ne peut pas la lire, par exemple un
film HEVC sur un téléviseur qui ne lit que le H.264, ou un film 4K sur un
appareil limité au 1080p.

Cette conversion est la seule partie de KROMA qui demande une vraie puissance de
calcul. Sur un NAS, un seul film 4K converti par le processeur peut l'occuper
entièrement. Une puce graphique fait le même travail en n'utilisant que quelques
pour cent du processeur. Cette page explique comment y donner accès à KROMA.

## Ce que KROMA peut utiliser

| Matériel | Nom dans le journal | Où |
| --- | --- | --- |
| Puce graphique Intel, Quick Sync | `qsv` ou `vaapi` | la plupart des processeurs Intel, y compris les modèles Synology à processeur Intel |
| Puce graphique AMD, VA-API | `vaapi` | ordinateurs Linux qui exécutent KROMA hors de Docker, avec le pilote AMD installé |
| Cartes graphiques NVIDIA | `nvenc` | ordinateurs équipés d'une carte NVIDIA |
| Mac à puce Apple et Mac Intel | `videotoolbox` | macOS, quand KROMA s'exécute hors de Docker |

KROMA essaie chacun au démarrage et ne l'utilise que s'il parvient à convertir
une image de test. Une puce présente que KROMA ne peut pas ouvrir compte comme
absente.

## Vérifier ce que KROMA utilise

À chaque démarrage, le journal du serveur indique où s'exécutent les
conversions :

```
INFO video re-encodes run on hardware accel="vaapi" reason=h264_vaapi encoded a test frame
```

ou, s'il n'a rien trouvé d'utilisable, une ligne qui commence par
`video re-encodes run on the CPU`. Son champ `reason` indique ce qui manquait à
chaque méthode, par exemple :

```
WARN video re-encodes run on the CPU reason=every listed device refused a test encode (qsv: /dev/dri/renderD128 is not readable by this user ...)
```

Lisez le journal dans KROMA sous **Serveur** > **Journaux**, avec
`docker compose logs kroma` dans Docker, ou dans
`/var/packages/kroma/var/kroma.log` avec le paquet Synology.

## Paquet Synology

Le paquet s'en charge sur les modèles Intel. Vous n'avez rien à faire.
Consultez [Synology : transcodage matériel](synology.md#transcodage-matériel)
pour les modèles qui n'ont pas de puce graphique, ou pas de pilote pour elle.

## Docker avec une puce graphique Intel

KROMA a besoin de trois choses, et la ligne du journal nomme celle qui manque.

1. **Le périphérique.** Transmettez le périphérique graphique au conteneur.
   Vérifiez d'abord qu'il existe sur l'ordinateur : `ls /dev/dri` affiche une
   entrée `renderD128`.
2. **La permission de l'ouvrir.** Le périphérique appartient à un groupe, en
   général `render`, et l'utilisateur de KROMA doit en faire partie. Trouvez
   l'ID du groupe :

   ```bash
   getent group render | cut -d: -f3
   ```

   Sur certains systèmes, le groupe est `video`. Sur un Synology, c'est
   `videodriver`.

3. **Les deux dans le fichier compose**, sous `kroma:` :

   ```yaml
       devices:
         - /dev/dri:/dev/dri
       group_add:
         - "993"
   ```

   Remplacez `993` par l'ID de groupe de l'étape 2.

Recréez le conteneur avec `docker compose up -d` et relisez le journal.

L'image contient les pilotes Intel : vous n'avez rien d'autre à installer sur
l'ordinateur. Elle ne contient aucun pilote pour les puces graphiques AMD : dans
Docker, une puce AMD n'est pas utilisée.

## Docker avec une carte NVIDIA

Installez le
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
sur l'ordinateur, puis donnez la carte au conteneur :

```yaml
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu, video]
```

## Choisir manuellement

Pour imposer une méthode, ou pour écarter le matériel pendant que vous cherchez
un problème, définissez `KROMA_HWACCEL` sur `qsv`, `vaapi`, `nvenc`,
`videotoolbox` ou `software`. Sur un ordinateur qui a plusieurs périphériques
graphiques, `KROMA_RENDER_NODE` choisit celui à utiliser. Consultez la
[référence de configuration](configuration.md#transcodage).

## Sans puce graphique

Sans matériel dédié, KROMA convertit avec le processeur. Cela fonctionne pour du
1080p sur la plupart des machines, mais c'est lent pour de la 4K. Deux choses
aident plus que n'importe quel réglage :

- Lisez sur un écran qui prend en charge le fichier. KROMA ne convertit alors
  rien.
- Limitez le nombre de conversions simultanées avec `KROMA_MAX_TRANSCODES`. Une
  demande au-delà de la limite est refusée : l'écran l'indique au lieu de
  saccader.
