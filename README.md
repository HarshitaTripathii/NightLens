# NightLens

A minimal Chrome extension that softens sudden bright flashes in YouTube
videos. It uses plain JavaScript and has no dependencies or build step.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `NightLens` folder.

Click the NightLens toolbar icon to turn protection on or off. The popup also
reports whether it is waiting for, watching, or currently softening a video.

After changing the extension files, click **Reload** on the NightLens card at
`chrome://extensions`, then reload any open YouTube tabs.

All frame analysis happens locally. Video frames are not stored or sent
anywhere.

NightLens is a viewing-comfort tool, not a medical device or a substitute for
medical guidance or accessibility controls.
