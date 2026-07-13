// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import {ExtensionPreferences, gettext as _}
    from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class BackdropPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings; // keep alive for the window's lifetime

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

        // prefs runs outside the shell, so read the configured workspace count
        // rather than the live list, and never hide already-saved entries.
        const wmPrefs = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        const saved = settings.get_strv('wallpapers');
        const count = Math.max(wmPrefs.get_int('num-workspaces'), saved.length, 1);

        for (let i = 0; i < count; i++)
            group.add(this._makeRow(window, settings, i));
    }

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

    _refreshSubtitle(row, settings, index) {
        const uri = settings.get_strv('wallpapers')[index];
        row.set_subtitle(uri ? Gio.File.new_for_uri(uri).get_basename() : _('Not set'));
    }

    _writeUri(settings, index, uri) {
        const arr = settings.get_strv('wallpapers');
        while (arr.length <= index)
            arr.push('');
        arr[index] = uri;
        settings.set_strv('wallpapers', arr);
    }

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
                return;
            }
            if (!file)
                return;
            this._writeUri(settings, index, file.get_uri());
            this._refreshSubtitle(row, settings, index);
        });
    }
}
