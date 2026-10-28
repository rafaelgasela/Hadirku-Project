import { Icon, type IconName } from "./Icon"
import { navigate } from "../lib/router"

export interface NavItem { path: string; label: string; icon: IconName; badge?: boolean }

export function BottomNav({ items, route, label }: { items: NavItem[]; route: string; label: string }) {
  return (
    <nav className="bottom-nav" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.path}
          className={route === item.path ? "active" : ""}
          onClick={() => navigate(item.path)}
          aria-current={route === item.path ? "page" : undefined}
        >
          <span>
            <Icon name={item.icon} size={20} />
            {item.badge && <i />}
          </span>
          {item.label}
        </button>
      ))}
    </nav>
  )
}
