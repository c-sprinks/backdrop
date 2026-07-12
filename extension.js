// SPDX-License-Identifier: GPL-2.0-or-later
//
// Backdrop — extension.js
//
// The whole job of this extension: when you switch workspaces, change the
// desktop wallpaper to the one you picked for that workspace.
//
// GNOME 45+ uses ES modules ("import ..."), and an extension is a class that
// extends the base Extension class and implements enable()/disable().

import Gio from 'gi://Gio';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class BackdropExtension extends Extension {
    // enable() runs when the extension is turned on (and after unlock, etc.).
    // It must set everything up; disable() must tear all of it back down.
    enable() {
        // Make wallpaper changes instant instead of a 1-second crossfade, so
        // switching workspaces looks like each wallpaper was already there
        // rather than fading in after the switch settles.
        this._killCrossfade();

        // Our OWN settings — the list of wallpaper URIs, one per workspace.
        // getSettings() reads the schema named in metadata.json.
        this._settings = this.getSettings();

        // The SYSTEM background settings. Writing "picture-uri" here is what
        // actually changes the desktop wallpaper. This is a separate schema
        // from ours, so we open it directly.
        this._background = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});

        // The shell object that tracks workspaces and which one is active.
        this._wm = global.workspace_manager;

        // React whenever the active workspace changes...
        this._switchId = this._wm.connect(
            'active-workspace-changed',
            () => this._applyForActiveWorkspace());

        // ...and also re-apply immediately if you edit the wallpaper list in
        // the preferences window, so changes preview without a workspace switch.
        this._changedId = this._settings.connect(
            'changed::wallpapers',
            () => this._applyForActiveWorkspace());

        // Apply once right now, for whatever workspace we're on at enable time.
        this._applyForActiveWorkspace();
    }

    // Look up the wallpaper for the current workspace and set it.
    _applyForActiveWorkspace() {
        const wallpapers = this._settings.get_strv('wallpapers');
        const index = this._wm.get_active_workspace_index();
        const uri = wallpapers[index];

        // No entry (or an empty one) for this workspace → leave it untouched.
        if (!uri)
            return;

        // Only write if it actually differs, to avoid a needless repaint/flash.
        if (this._background.get_string('picture-uri') !== uri)
            this._background.set_string('picture-uri', uri);

        // Set the dark variant too, so it applies in either light or dark theme.
        if (this._background.get_string('picture-uri-dark') !== uri)
            this._background.set_string('picture-uri-dark', uri);
    }

    // GNOME crossfades the desktop wallpaper over 1 second whenever picture-uri
    // changes (see BackgroundManager._swapBackgroundActor in the shell's
    // background.js). With one global background actor, that fade plays *after*
    // the ~250ms workspace slide finishes, so you watch the new wallpaper morph
    // in. We don't want that — we want a hard cut.
    //
    // The shell already has a no-fade path in that exact method: during a screen
    // transition it just calls oldBackgroundActor.destroy() with no ease. We
    // replace _swapBackgroundActor with a version that always takes that instant
    // path. It's a faithful copy of upstream minus the ease() — not a guess at
    // internals — and disable() restores the original method verbatim.
    _killCrossfade() {
        const proto = Background.BackgroundManager?.prototype;
        // If a future GNOME renames or drops this method, skip the patch and
        // keep working with the default crossfade rather than crash.
        if (!proto || typeof proto._swapBackgroundActor !== 'function')
            return;

        this._originalSwap = proto._swapBackgroundActor;
        proto._swapBackgroundActor = function () {
            const oldBackgroundActor = this.backgroundActor;
            this.backgroundActor = this._newBackgroundActor;
            this._newBackgroundActor = null;
            this.emit('changed');
            oldBackgroundActor.destroy(); // instant — no opacity ease
        };
    }

    // disable() must completely undo enable(): disconnect every signal and drop
    // every reference. GNOME disables extensions on the lock screen, so a sloppy
    // disable() leaks memory and gets an extension rejected from review.
    disable() {
        // Put GNOME's original crossfade method back exactly as it was.
        if (this._originalSwap) {
            Background.BackgroundManager.prototype._swapBackgroundActor =
                this._originalSwap;
            this._originalSwap = null;
        }

        if (this._switchId) {
            this._wm.disconnect(this._switchId);
            this._switchId = null;
        }
        if (this._changedId) {
            this._settings.disconnect(this._changedId);
            this._changedId = null;
        }
        this._settings = null;
        this._background = null;
        this._wm = null;
    }
}
