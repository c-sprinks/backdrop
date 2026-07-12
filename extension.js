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
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class BackdropExtension extends Extension {
    // enable() runs when the extension is turned on (and after unlock, etc.).
    // It must set everything up; disable() must tear all of it back down.
    enable() {
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

    // disable() must completely undo enable(): disconnect every signal and drop
    // every reference. GNOME disables extensions on the lock screen, so a sloppy
    // disable() leaks memory and gets an extension rejected from review.
    disable() {
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
