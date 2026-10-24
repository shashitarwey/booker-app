import { RELATIONS } from '../constants';

export default function PersonAvatar({ person, size = 42 }) {
  return (
    <div
      className="person-avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: RELATIONS[person.relation]?.color }}
    >
      {(person.name || '?').trim().charAt(0).toUpperCase()}
    </div>
  );
}
