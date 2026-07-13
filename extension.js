// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class BackdropExtension extends Extension {
    enable() {
        this._killCrossfade();

        this._settings = this.getSettings();
        this._background = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
        this._wm = global.workspace_manager;

        this._switchId = this._wm.connect(
            'active-workspace-changed',
            () => this._applyForActiveWorkspace());
        this._changedId = this._settings.connect(
            'changed::wallpapers',
            () => this._applyForActiveWorkspace());

        this._applyForActiveWorkspace();
    }

    _applyForActiveWorkspace() {
        const wallpapers = this._settings.get_strv('wallpapers');
        const uri = wallpapers[this._wm.get_active_workspace_index()];
        if (!uri)
            return;

        if (this._background.get_string('picture-uri') !== uri)
            this._background.set_string('picture-uri', uri);
        if (this._background.get_string('picture-uri-dark') !== uri)
            this._background.set_string('picture-uri-dark', uri);
    }

    // Replace the wallpaper crossfade with a hard cut so it changes in step with
    // the workspace switch instead of fading in afterwards. Restored in disable().
    _killCrossfade() {
        const proto = Background.BackgroundManager?.prototype;
        if (!proto || typeof proto._swapBackgroundActor !== 'function')
            return;

        this._originalSwap = proto._swapBackgroundActor;
        proto._swapBackgroundActor = function () {
            const oldBackgroundActor = this.backgroundActor;
            this.backgroundActor = this._newBackgroundActor;
            this._newBackgroundActor = null;
            this.emit('changed');
            oldBackgroundActor.destroy();
        };
    }

    disable() {
        if (this._originalSwap) {
            Background.BackgroundManager.prototype._swapBackgroundActor = this._originalSwap;
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
