# Sharing animations

smoothstep.io has no server, so it never uploads your animations. You can still share them in a few
ways, most of them from the Share button at the top of the app.

## A link

Share gives you a link that holds the whole animation, compressed into the address after the `#`.
Anyone who opens it gets the animation in the editor, and can play it, change it and save their own
copy. The built-in examples make links of 600 to 3,200 characters, which work in chat apps and
email. Shorter links also fit in a QR code, which Share can show for phones to scan.

A link can't carry the images and videos you added yourself, only the built-in textures. When you
share an animation that uses your own images or videos, those texture slots are empty for whoever
opens the link. To share them too, share an animation file instead, as below.

## An animation file

File → Export downloads a `.smoothstep.json` file with your own images and videos inside it. A
video makes the file about a third bigger than the video itself.
smoothstep.io can open one of these from any website that lets other sites read its files. Put the file
online, then paste its address into "Link to a file online" in Share, and Share gives you a link that
opens it. The link reads the file each time it's opened, so if you change the file at that address, the
link opens the new version.

- **A GitHub gist.** Make a gist at [gist.github.com](https://gist.github.com): drag the animation file
  onto the page, or paste in its contents and name it with `.smoothstep.json` on the end, then click
  "Create secret gist" or "Create public gist". Paste the gist's address into Share. The link is
  `https://smoothstep.io/#gist/<id>`, where `<id>` is the gist's id, and it always opens the gist's
  latest version, so you can edit the gist without changing the link. GitHub lets each visitor open up
  to 60 gists an hour this way.
- **Any other address,** such as a file in a GitHub repository or on your own website. Paste the file's
  `https` address into Share, or its page on github.com. A link to a file on a branch opens the latest
  version after a few minutes, and a link to a particular commit always opens that version. The link is
  `https://smoothstep.io/#url/<address of the file>`. The site has to allow other websites to read
  the file (it must send an `Access-Control-Allow-Origin` header). GitHub, GitHub Pages and most
  static hosting do.

File → Import takes any of these links: a smoothstep.io link, a gist's address, a file's page on
github.com, or a file's address. It adds the animation to the ones saved in your browser, with its
images. Whoever opens a link someone sent them gets the images too, and they're kept in their browser
if they save the animation.

## On a website

Share also gives you code for an `<iframe>` that plays the animation on any web page. The player,
`embed.html`, loops the animation and pauses when you click it, with a link to open it in smoothstep.
It takes the same `#share/`, `#gist/`, `#url/` and `#example/` addresses as the app.

Download player file saves a single HTML page that plays the animation, with its script and the
images and videos it uses inside it. It works offline, opened straight from your downloads, and you can put it
on any website without smoothstep.
