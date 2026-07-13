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

        this._settings = settings;
        this._window = window;
        this._rows = [];

        const page = new Adw.PreferencesPage({
            title: _('Wallpapers'),
            icon_name: 'preferences-desktop-wallpaper-symbolic',
        });
        window.add(page);

        this._group = new Adw.PreferencesGroup({
            title: _('Per-Workspace Wallpapers'),
            description: _('Pick an image for each workspace. Leave one empty to keep that workspace’s current wallpaper.'),
        });
        page.add(this._group);

        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Add a workspace'),
        });
        addButton.add_css_class('flat');
        addButton.connect('clicked', () => this._addRow());
        this._group.set_header_suffix(addButton);

        // Prefs runs outside the shell and can't see the live workspace list, so
        // start from the configured count and never hide already-saved entries.
        // The +/- buttons let the user match however many workspaces they use.
        const wmPrefs = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        const saved = settings.get_strv('wallpapers');
        const count = Math.max(wmPrefs.get_int('num-workspaces'), saved.length, 1);

        for (let i = 0; i < count; i++)
            this._addRow();
    }

    _addRow() {
        const index = this._rows.length;
        const row = new Adw.ActionRow({title: `${_('Workspace')} ${index + 1}`});
        this._refreshSubtitle(row, index);

        const chooseButton = new Gtk.Button({
            label: _('Choose…'),
            valign: Gtk.Align.CENTER,
        });
        chooseButton.connect('clicked', () => this._chooseFile(index, row));

        const clearButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Clear'),
        });
        clearButton.add_css_class('flat');
        clearButton.connect('clicked', () => {
            this._writeUri(index, '');
            this._refreshSubtitle(row, index);
        });

        const removeButton = new Gtk.Button({
            icon_name: 'list-remove-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Remove the last workspace'),
        });
        removeButton.add_css_class('flat');
        removeButton.connect('clicked', () => this._removeLastRow());

        row.add_suffix(chooseButton);
        row.add_suffix(clearButton);
        row.add_suffix(removeButton);
        row._removeButton = removeButton;

        this._group.add(row);
        this._rows.push(row);
        this._updateRemoveButtons();
    }

    _removeLastRow() {
        if (this._rows.length <= 1)
            return;

        const row = this._rows.pop();
        this._group.remove(row);

        // Drop the saved URI for the slot that no longer exists.
        const arr = this._settings.get_strv('wallpapers');
        if (arr.length > this._rows.length) {
            arr.length = this._rows.length;
            this._settings.set_strv('wallpapers', arr);
        }

        this._updateRemoveButtons();
    }

    // Only the last row shows a remove button, and only when more than one exists,
    // so workspaces stay a contiguous 1..N list.
    _updateRemoveButtons() {
        const last = this._rows.length - 1;
        this._rows.forEach((row, i) => {
            row._removeButton.visible = i === last && this._rows.length > 1;
        });
    }

    _refreshSubtitle(row, index) {
        const uri = this._settings.get_strv('wallpapers')[index];
        row.set_subtitle(uri ? Gio.File.new_for_uri(uri).get_basename() : _('Not set'));
    }

    _writeUri(index, uri) {
        const arr = this._settings.get_strv('wallpapers');
        while (arr.length <= index)
            arr.push('');
        arr[index] = uri;
        this._settings.set_strv('wallpapers', arr);
    }

    _chooseFile(index, row) {
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

        dialog.open(this._window, null, (dlg, result) => {
            let file;
            try {
                file = dlg.open_finish(result);
            } catch (_e) {
                return;
            }
            if (!file)
                return;
            this._writeUri(index, file.get_uri());
            this._refreshSubtitle(row, index);
        });
    }
}
