import { Button, Group } from '@mantine/core';
import type { ReactNode } from 'react';

import AppModal from '../app/AppModal';

interface AcknowledgementsProps {
  show: boolean;
  onHide(): void;
}

function Link({href, children}: {href: string; children: ReactNode}) {
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
}

export default function Acknowledgements({show, onHide}: AcknowledgementsProps) {
  return (
    <AppModal opened={show} onClose={onHide} title="Acknowledgements" size="lg" classNames={{body: "prose"}}>
        <p>
          smoothstep.io was developed by <Link href="https://twitter.com/matthen2">Matt Henderson</Link>.
        </p>
        <p>
          smoothstep.io is built on the work of a lot of open-source code,
          and I am grateful to all the projects that have been
          used in its development.
        </p>
        <p>
          I would like to highlight <Link href="https://www.shadertoy.com/">Shadertoy</Link>,
          as an inspiration for smoothstep.io.
        </p>
        <p>
          Thanks to the following open-source projects in particular:
        </p>
        <ul>
          <li><Link href="https://github.com/patriciogonzalezvivo/glslEditor">glslEditor</Link> - from the book of shaders</li>
          <li><Link href="https://codemirror.net/">CodeMirror</Link></li>
          <li><Link href="https://mediabunny.dev/">Mediabunny</Link></li>
          <li><Link href="https://github.com/mattdesl/gifenc">gifenc</Link></li>
          <li><Link href="https://github.com/101arrowz/fflate">fflate</Link></li>
          <li><Link href="https://mantine.dev/">Mantine</Link></li>
          <li><Link href="https://www.khronos.org/webgl/">WebGL</Link></li>
          <li><Link href="https://github.com/dracula/dracula-theme/">Dracula theme</Link></li>
        </ul>
        <p>
          The default textures are free to reuse: CC0 photos from Flickr, public domain
          textures and NASA imagery, a photo under the Unsplash License, and work by
          Nicky and Matt Henderson. Thanks to the artists:
        </p>
        <ul>
          <li><Link href="https://www.rnhenderson.com/">Nicky Henderson</Link></li>
          <li><Link href="http://pdtextures.blogspot.com">pdtextures.blogspot.com</Link></li>
          <li><Link href="https://unsplash.com/@joerga">Jörg Angeli</Link> on Unsplash</li>
          <li><Link href="https://www.flickr.com/photos/188742053@N05">Jenna Anthony</Link></li>
          <li><Link href="https://www.flickr.com/photos/dsoltesz">Deborah Lee Soltesz</Link></li>
          <li><Link href="https://www.flickr.com/photos/andyweeks">Andy Weeks</Link></li>
          <li><Link href="https://www.flickr.com/photos/kees-scherer">Kees Scherer</Link></li>
          <li><Link href="https://www.flickr.com/photos/137236022@N03">Pavel Kovalev</Link></li>
          <li><Link href="https://www.flickr.com/photos/86012097@N08">akhenatenator</Link></li>
          <li>NASA Goddard Space Flight Center (Blue Marble: Reto Stöckli, Robert Simmon)</li>
        </ul>
        <p>
          The font textures are drawn with Courier Prime, Arimo, Tinos, Inter and Exo 2,
          under the <Link href="https://openfontlicense.org">SIL Open Font License</Link>.
        </p>
      <Group justify="flex-end" mt="lg"><Button variant="default" onClick={onHide}>Close</Button></Group>
    </AppModal>
  );
}
