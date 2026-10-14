import { hash, initials } from '../lib/format';
import { jefaturaInfo } from '../shared/constants';
import type { PublicPerson } from '../shared/types';

const FILLS = ['#2F5DA8', '#3B7DD8', '#1F8A9E', '#5B63C9', '#A8508F', '#B8702A', '#3E8E6A', '#7A56D6'];

export function Avatar({ person, size = 64, ring = true, className = '' }: {
  person: Pick<PublicPerson, 'id' | 'full_name' | 'photo_url' | 'jefatura'>; size?: number; ring?: boolean; className?: string;
}) {
  const color = jefaturaInfo(person.jefatura).color;
  return (
    <span
      className={`avatar ${className}`}
      style={{
        width: size, height: size, fontSize: size * 0.34,
        background: person.photo_url ? '#0b2a63' : FILLS[hash(person.id) % FILLS.length],
        boxShadow: ring ? `0 0 0 ${Math.max(2, size / 22)}px ${color}` : undefined,
      }}
      aria-hidden="true"
    >
      {person.photo_url ? <img src={person.photo_url} alt="" draggable={false} /> : initials(person.full_name)}
    </span>
  );
}
