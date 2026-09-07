type NavigationIconName = 'catalogue' | 'collection' | 'friends' | 'community' | 'places' | 'admin'

// Shared outline and palette keep the pirate illustrations consistent at small sizes.
export function NavigationIcon({ name }: { name: NavigationIconName }) {
  const illustrations = {
    catalogue: <>
      <path d="M7 23v-8C7 7 41 7 41 15v8" fill="#a85b35" />
      <path d="M8 16c7-5 25-5 32 0M16 11v12m16-12v12" stroke="#f6cc70" strokeWidth="3" />
      <path d="M6 22h36v16a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3Z" fill="#8d452e" />
      <path d="M7 25h34M13 26v14m22-14v14" stroke="#f6cc70" strokeWidth="3" />
      <rect x="20" y="22" width="8" height="11" rx="2" fill="#f6cc70" />
      <path d="M24 26v3" />
      <path d="m36 4 1.5 3.5L41 9l-3.5 1.5L36 14l-1.5-3.5L31 9l3.5-1.5Z" fill="#ffe7a0" stroke="none" />
    </>,
    collection: <>
      <path d="M24 14C16 7 5 15 7 28c1 9 10 16 17 13 8 3 16-5 17-14 1-12-10-20-17-13Z" fill="#a78be3" />
      <path d="M24 15c-4-8 0-13 6-10 3 2 0 5-2 3" fill="none" stroke="#a4cf79" strokeWidth="3" />
      <path d="M25 11c5-6 10-5 13-2-5 4-8 5-13 2Z" fill="#a4cf79" />
      <g fill="none" stroke="#62448f" strokeWidth="1.8">
        <path d="M13 18c-5 6 4 10 5 5 1-3-3-4-3-1M28 18c-6 0-5 9 0 8 4-1 2-6 0-4M34 28c6 2 2 10-2 6-2-2 0-4 2-3M13 31c-1 6 8 8 8 2 0-3-4-3-4-1M25 32c-4 5 1 9 4 6" />
      </g>
    </>,
    friends: <>
      <path d="M2 39v-5c0-8 16-8 17 0v5" fill="#4ca589" />
      <path d="M29 39v-5c0-8 16-8 17 0v5" fill="#435e85" />
      <circle cx="10" cy="21" r="7" fill="#f2c591" />
      <path d="m3 19 1-8 4 2 3-4 2 4 4-1v7l-5-3-4 3Z" fill="#83b978" />
      <circle cx="38" cy="21" r="7" fill="#f2c591" />
      <path d="M31 20c-3-12 16-14 14 0l-7-4-2 9-1-7Z" fill="#f6cc70" />
      <path d="M12 43v-7c0-11 24-11 24 0v7" fill="#da6458" />
      <circle cx="24" cy="25" r="8" fill="#f5cea2" />
      <path d="M17 19c-1-13 15-13 14 0" fill="#f6cc70" />
      <path d="M17 15h14v5H17Z" fill="#d95c50" />
      <ellipse cx="24" cy="20" rx="13" ry="3" fill="#f6cc70" />
      <path d="M21 29q3 3 6 0" fill="none" />
    </>,
    community: <>
      <path d="M7 39h32c5 0 6-6 1-7l-7-1H15c-5 0-8 3-8 8Z" fill="#e9c996" />
      <circle cx="23" cy="26" r="13" fill="#9dbb95" />
      <path d="M28 30c-10 5-16-7-9-11 6-4 11 4 6 7-3 2-5-1-3-2" fill="none" stroke="#45695b" strokeWidth="2" />
      <path d="M31 34V23c0-7 11-7 11 0v10" fill="#e9c996" />
      <path d="M34 22v-9m6 9v-9" stroke="#e9c996" strokeWidth="3" />
      <circle cx="33" cy="13" r="3" fill="#fff8e6" /><circle cx="41" cy="13" r="3" fill="#fff8e6" />
      <path d="M33 13h.1M41 13h.1M35 29q2 2 4 0" />
      <path d="M9 17c-2-11 15-16 21-7l-4 4-5-4-5 2-2 6Z" fill="#df7771" />
    </>,
    places: <>
      <path d="M18 4h12l2 12H16Zm-2 29h16l-2 12H18Z" fill="#a96b43" />
      <path d="M12 29h24v9H12Z" fill="#e3b866" />
      <path d="M10 27v-5a14 14 0 0 1 28 0v5" fill="#83cfdb" fillOpacity=".9" />
      <ellipse cx="24" cy="28" rx="16" ry="6" fill="#f6cc70" />
      <ellipse cx="24" cy="27" rx="11" ry="3" fill="#498b9e" />
      <path d="m24 26 6-14-1 15-5-1Z" fill="#e66d62" />
      <path d="m24 26-4 8 9-7" fill="#fff3cf" />
      <path d="M16 19c1-4 3-6 6-7" fill="none" stroke="#e2fbff" strokeWidth="2.5" />
    </>,
    admin: <>
      <g stroke="#fff1d5" strokeWidth="4"><path d="m8 28 31 14M9 42l31-14" /></g>
      <path d="M14 25c-5-15 25-15 20 0l-5 6v7H19v-7Z" fill="#fff1d5" />
      <path d="M14 16C14 2 34 2 34 16" fill="#f6cc70" />
      <path d="M14 12h20v5H14Z" fill="#d95c50" />
      <ellipse cx="24" cy="17" rx="18" ry="3.5" fill="#f6cc70" />
      <ellipse cx="19" cy="25" rx="3" ry="3.5" fill="#18283c" stroke="none" />
      <ellipse cx="29" cy="25" rx="3" ry="3.5" fill="#18283c" stroke="none" />
      <path d="m24 29-1 2h2ZM19 34h10m-7-2v5m4-5v5" />
    </>
  }

  return (
    <svg aria-hidden="true" focusable="false" width="36" height="36" viewBox="0 0 48 48" fill="none" stroke="#192a3b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {illustrations[name]}
    </svg>
  )
}
