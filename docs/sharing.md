# Sharing animations

smoothstep has no server, so it never uploads your animations. You can still share them in a few
ways, most of them from the Share button at the top of the app.

## A link

Share gives you a link that holds the whole animation, compressed into the address after the `#`.
Anyone who opens it gets the animation in the editor, and can play it, change it and save their own
copy. The built-in examples make links of 600 to 3,200 characters, which work in chat apps and
email. Shorter links also fit in a QR code, which Share can show for phones to scan.

A link can't carry the images you added yourself, only the built-in textures. When you share an
animation that uses your own images, those texture slots are empty for whoever opens the link. To
share the images too, share an animation file instead, as below.

## An animation file

File → Download animation file saves a `.smoothstep.json` file with your own images inside it.
smoothstep can open one of these from any website that lets other sites read its files. Put the file
online, then paste its address into "Link to a file online" in Share, and Share gives you a link that
opens it. Whoever opens the link gets the latest version of the file, so you can update the animation
without changing the link.

- **A GitHub gist.** Make a gist at [gist.github.com](https://gist.github.com): drag the animation file
  onto the page, or paste in its contents and give it the same name, then click "Create secret gist".
  Paste the gist's address into Share. Secret gists work too. The link is
  `https://smoothstep.io/app/#gist/<id>`, where `<id>` is the last part of the gist's address. GitHub
  lets each visitor open up to 60 gists an hour this way.
- **Any other address,** such as a file in a GitHub repository or on your own website. Paste the file's
  address into Share, or its page on github.com. The link is
  `https://smoothstep.io/app/#url/<address of the file>`. The site has to allow other websites to read
  the file (it must send an `Access-Control-Allow-Origin` header). GitHub, GitHub Pages and most
  static hosting do.

File → Open from link takes any of these: a smoothstep link, a gist's address, a file's page on
github.com, or a file's address. Whoever opens the animation gets the images with it, and they're
kept in their browser if they save it.

## On a website

Share also gives you code for an `<iframe>` that plays the animation on any web page. The player,
`embed.html`, loops the animation and pauses when you click it, with a link to open it in smoothstep.
It takes the same `#share/`, `#gist/`, `#url/` and `#example/` addresses as the app.

Download player file saves a single HTML page that plays the animation, with its script and the
images it uses inside it. It works offline, opened straight from your downloads, and you can put it
on any website without smoothstep.
