# Vinilo: tu música en el iPhone, gratis y sin internet

Vinilo es un reproductor estilo Spotify (biblioteca, buscador, playlists, mini‑reproductor,
pantalla de "Reproduciendo", aleatorio, repetir y controles en la pantalla de bloqueo).
Es una **app web instalable**: la abres una vez en Safari, la añades a la pantalla de inicio
y desde entonces funciona como una app, **sin conexión**. Tus canciones se guardan dentro del iPhone.

No hace falta Mac, Xcode ni pagar los 99 USD de Apple Developer.

---

## 1. Ponerla en internet una sola vez (gratis)

El iPhone solo instala apps web servidas por HTTPS, así que hay que subir esta carpeta a un hosting
gratuito **una vez**. La forma más fácil es GitHub Pages:

1. Crea una cuenta en https://github.com y un repositorio nuevo, por ejemplo `vinilo`. Ponlo como *Public*.
2. Pulsa **Add file › Upload files** y arrastra **todos los archivos de esta carpeta**
   (`index.html`, `app.js`, `sw.js`, los `icon-*.png`, etc.). Luego pulsa **Commit changes**.
3. Ve a **Settings › Pages**. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`, y guarda.
4. En uno o dos minutos tu app estará en `https://TU_USUARIO.github.io/vinilo/`.

(Alternativas igual de gratuitas: Netlify o Cloudflare Pages. Solo tienes que arrastrar la carpeta.)

## 2. Instalarla en el iPhone

1. Abre esa dirección en **Safari** (tiene que ser Safari).
2. Pulsa **Compartir** › **Añadir a pantalla de inicio**.
3. **Abre Vinilo desde el icono una vez con internet.** En ese momento la app se guarda para usarse sin conexión.
4. Listo: desde ahora funciona en modo avión.

> Importante: la app instalada en la pantalla de inicio tiene su propio almacenamiento, separado de Safari.
> Sube la música **desde el icono**, no desde Safari. Si borras el icono, se borra también la música que tenga dentro.

## 3. Meter tu música

Pulsa **+** y elige archivos desde la app **Archivos** (MP3, M4A/AAC, WAV, FLAC, OGG/Opus). Puedes elegir varios a la vez.
Vinilo lee el título, el artista, el álbum y la portada de los MP3 y M4A. En los demás formatos usa el nombre del archivo,
con la forma `Artista - Título.mp3`.

Formas de pasar canciones desde tu PC con Windows a la app Archivos del iPhone:

- **iCloud Drive**: instala iCloud para Windows, o entra en icloud.com, y copia la carpeta de música.
- **Memoria USB o SSD**: los iPhone con USB‑C la leen directamente. Con Lightning necesitas un adaptador.
- **Carpeta compartida de Windows, por Wi‑Fi y sin internet**: comparte la carpeta en tu PC y luego, en Archivos,
  pulsa ⋯ › *Conectarse al servidor* › `smb://IP-DE-TU-PC`.

## 4. "Importar" desde Spotify y Apple Music: qué se puede y qué no

**Cómo funciona Spotify por dentro:** la app no guarda canciones normales. Descarga el audio por trozos y **cifrado**
(Ogg Vorbis/AAC) desde sus servidores. Las "descargas" de Premium también se guardan cifradas dentro de la app,
con una licencia atada a tu cuenta, y dejan de funcionar si no te conectas al menos una vez cada 30 días.
Apple Music hace lo mismo con su cifrado FairPlay (archivos `.m4p`). Sacar el audio de ahí significaría saltarse ese
cifrado (DRM), algo que es ilegal en la mayoría de los países e incumple sus condiciones. Por eso Vinilo no lo hace.

**Lo que sí puedes traer:**

- **Tus playlists (la lista de canciones).** En Vinilo ve a *Playlists › Importar de Spotify / Apple Music*:
  - **Spotify:** entra en https://exportify.app (gratis, solo necesitas internet en ese momento), inicia sesión
    y descarga el CSV de cada playlist.
  - **Apple Music / iTunes:** en iTunes para Windows o en la app Música del Mac, elige la playlist y ve a
    *Archivo › Biblioteca › Exportar playlist*. Guárdala como **Texto** o **M3U**.

  Vinilo busca cada canción en tu biblioteca (sin importarle acentos, "feat." ni "Remastered").
  Las que no encuentra aparecen en gris como *"No están en tu biblioteca"*. Cuando subas esos archivos,
  se añaden solas a la playlist.
- **Canciones compradas en iTunes Store.** Desde 2009 vienen sin DRM (`.m4a`). Descárgalas en iTunes y súbelas a Vinilo.
- **Otras fuentes legales de archivos:** tus CDs pasados a MP3, Bandcamp, Free Music Archive, Jamendo e Internet Archive.

## Limitaciones conocidas

- **Música en segundo plano:** con la pantalla bloqueada o al cambiar de app, iOS 17 y 18 siguen reproduciendo
  en apps web instaladas. En versiones más antiguas de iOS a veces se corta.
- **Espacio:** el límite lo pone iOS según el espacio libre del iPhone. Si se llena, Vinilo te avisa de cuántas canciones no pudo guardar.
- **Sin sincronizar con otros dispositivos:** cada iPhone tiene su propia biblioteca. Eso es lo que permite que funcione sin internet.
- Las portadas de FLAC/OGG no se leen; esos archivos se muestran con una portada genérica.

## Para desarrolladores

- Probar en el PC: `python -m http.server 8765` dentro de esta carpeta y abre http://localhost:8765
- Comprobación automática del lector de etiquetas y del importador de playlists: `node tests.mjs`
- Si cambias cualquier archivo, sube la versión en `sw.js` (`vinilo-v1` → `vinilo-v2`).
  Si no lo haces, los iPhone seguirán usando la copia anterior.
