// SPDX-License-Identifier: GPL-2.0-or-later
//
// Backdrop — prefs.js
//
// The settings window: one row per workspace, each with a file picker and a
// clear button. IMPORTANT: prefs.js runs in its OWN process, not inside the
// shell. So it uses GTK/libadwaita directly and CANNOT touch `global`
// (the live shell). It reads the workspace count from GSettings instead.

import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import {ExtensionPreferences, gettext as _}
    from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class BackdropPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Keep a reference on the window so the garbage collector doesn't
        // reclaim our settings object while the window is still open.
        window._settings = settings;

        const page = new Adw.PreferencesPage({
            title: _('Wallpapers'),
            icon_name: 'preferences-desktop-wallpaper-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: _('Per-Workspace Wallpapers'),
            description: _('Pick an image for each workspace. Leave one empty to keep that workspace’s current wallpaper.'),
        });
        page.add(group);

        // How many rows to show. Prefs can't see the live workspace list, so we
        // read the configured static count, and never show fewer rows than we
        // already have saved wallpapers for.
        const wmPrefs = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        const saved = settings.get_strv('wallpapers');
        const count = Math.max(wmPrefs.get_int('num-workspaces'), saved.length, 1);

        for (let i = 0; i < count; i++)
            group.add(this._makeRow(window, settings, i));
    }

    // Build one Adw row for workspace `index` (0-based).
    _makeRow(window, settings, index) {
        const row = new Adw.ActionRow({title: `${_('Workspace')} ${index + 1}`});
        this._refreshSubtitle(row, settings, index);

        const chooseButton = new Gtk.Button({
            label: _('Choose…'),
            valign: Gtk.Align.CENTER,
        });
        chooseButton.connect('clicked',
            () => this._chooseFile(window, settings, index, row));

        const clearButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Clear'),
        });
        clearButton.add_css_class('flat');
        clearButton.connect('clicked', () => {
            this._writeUri(settings, index, '');
            this._refreshSubtitle(row, settings, index);
        });

        row.add_suffix(chooseButton);
        row.add_suffix(clearButton);
        return row;
    }

    // Show the chosen file's name under the row title (or "Not set").
    _refreshSubtitle(row, settings, index) {
        const uri = settings.get_strv('wallpapers')[index];
        row.set_subtitle(uri ? Gio.File.new_for_uri(uri).get_basename() : _('Not set'));
    }

    // Write one URI into the array at `index`, padding shorter arrays with ''.
    _writeUri(settings, index, uri) {
        const arr = settings.get_strv('wallpapers');
        while (arr.length <= index)
            arr.push('');
        arr[index] = uri;
        settings.set_strv('wallpapers', arr);
    }

    // Open a GTK file chooser filtered to images; save the pick on success.
    _chooseFile(window, settings, index, row) {
        const dialog = new Gtk.FileDialog({
            title: `${_('Select a wallpaper for workspace')} ${index + 1}`,
            modal: true,
        });

        const filter = new Gtk.FileFilter();
        filter.set_name(_('Images'));
        filter.add_pixbuf_formats();
        const filters = new Gio.ListStore({item_type: Gtk.FileFilter});
        filters.append(filter);
        dialog.set_filters(filters);

        dialog.open(window, null, (dlg, result) => {
            let file;
            try {
                file = dlg.open_finish(result);
            } catch (_e) {
                return; // dialog cancelled — nothing to do
            }
            if (!file)
                return;
            this._writeUri(settings, index, file.get_uri());
            this._refreshSubtitle(row, settings, index);
        });
    }
}
