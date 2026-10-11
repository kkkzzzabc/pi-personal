/**
 * Per-app approval for the native computer-use tools.
 *
 * Reading or controlling an app requires the user's approval once per session. Some apps are
 * never allowed: terminals (including the one hosting pi, which would let the model drive its
 * own shell), System Settings, and Keychain Access.
 */

export interface AppIdentity {
	id: string;
	name?: string;
}

export const DEFAULT_DENIED_APPS: readonly string[] = [
	"com.apple.Terminal",
	"com.googlecode.iterm2",
	"com.mitchellh.ghostty",
	"net.kovidgoyal.kitty",
	"io.alacritty",
	"com.github.wez.wezterm",
	"dev.warp.Warp-Stable",
	"co.zeit.hyper",
	"com.apple.systempreferences",
	"com.apple.Settings",
	"com.apple.keychainaccess",
	"com.apple.Passwords",
];

export interface ApprovalUI {
	hasUI: boolean;
	confirm(title: string, message: string): Promise<boolean>;
}

export class AppApprovals {
	private readonly denied: Set<string>;
	private readonly approved = new Set<string>();

	/** `hostApp` is the bundle id of the app hosting pi (macOS sets `__CFBundleIdentifier`). */
	constructor(denied: readonly string[] = DEFAULT_DENIED_APPS, hostApp = process.env.__CFBundleIdentifier) {
		this.denied = new Set([...denied, ...(hostApp ? [hostApp] : [])].map((id) => id.toLowerCase()));
	}

	isDenied(app: AppIdentity): boolean {
		return this.denied.has(app.id.toLowerCase());
	}

	isApproved(app: AppIdentity): boolean {
		return this.approved.has(app.id.toLowerCase());
	}

	/** Throws unless the app may be used; asks the user the first time in a session. */
	async ensure(app: AppIdentity, ui: ApprovalUI): Promise<void> {
		const label = app.name ? `${app.name} (${app.id})` : app.id;
		if (this.isDenied(app)) {
			throw new Error(`Computer use is not allowed for ${label}.`);
		}
		if (this.isApproved(app)) return;
		if (!ui.hasUI) {
			throw new Error(`Computer use for ${label} needs the user's approval, which requires an interactive UI.`);
		}
		const ok = await ui.confirm(
			"Allow computer use?",
			`Let pi read and control ${label} for the rest of this session? It may see window contents and send clicks and keystrokes.`,
		);
		if (!ok) throw new Error(`The user did not allow computer use for ${label}.`);
		this.approved.add(app.id.toLowerCase());
	}

	reset(): void {
		this.approved.clear();
	}
}
