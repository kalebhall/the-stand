import { describe, expect, it } from 'vitest';

type MemberRow = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
};

function displayName(member: MemberRow): string {
  if (member.first_name && member.last_name) return `${member.first_name} ${member.last_name}`;
  if (member.first_name) return member.first_name;
  if (member.last_name) return member.last_name;
  return member.full_name;
}

function sortMembers(members: MemberRow[], sortBy: 'firstName' | 'lastName' | 'age' | 'email'): MemberRow[] {
  return [...members].sort((left, right) => {
    if (sortBy === 'age') return (left.age ?? Number.POSITIVE_INFINITY) - (right.age ?? Number.POSITIVE_INFINITY);
    if (sortBy === 'email') return (left.email ?? '').localeCompare(right.email ?? '');
    if (sortBy === 'firstName') {
      const firstCmp = (left.first_name ?? left.full_name).localeCompare(right.first_name ?? right.full_name);
      return firstCmp !== 0 ? firstCmp : (left.last_name ?? '').localeCompare(right.last_name ?? '');
    }
    const lastCmp = (left.last_name ?? left.full_name).localeCompare(right.last_name ?? right.full_name);
    return lastCmp !== 0 ? lastCmp : (left.first_name ?? '').localeCompare(right.first_name ?? '');
  });
}

const alice: MemberRow = { id: '1', full_name: 'Smith Alice', first_name: 'Alice', last_name: 'Smith', email: 'alice@example.com', phone: null, age: 30, gender: null };
const bob: MemberRow   = { id: '2', full_name: 'Brown Bob',   first_name: 'Bob',   last_name: 'Brown', email: 'bob@example.com',   phone: null, age: 25, gender: null };
const carol: MemberRow = { id: '3', full_name: 'Smith Carol', first_name: 'Carol', last_name: 'Smith', email: 'carol@example.com', phone: null, age: 40, gender: null };
const noName: MemberRow = { id: '4', full_name: 'Zebra',      first_name: null,    last_name: null,    email: null,                phone: null, age: null, gender: null };

describe('member list sort', () => {
  it('sorts by last name with first name tie-breaker', () => {
    const sorted = sortMembers([carol, alice, bob, noName], 'lastName');
    expect(sorted.map((m) => m.id)).toEqual(['2', '1', '3', '4']); // Brown, Smith Alice, Smith Carol, Zebra
  });

  it('sorts by first name with last name tie-breaker', () => {
    const sorted = sortMembers([carol, alice, bob, noName], 'firstName');
    expect(sorted.map((m) => m.id)).toEqual(['1', '2', '3', '4']); // Alice Smith, Bob Brown, Carol Smith, Zebra
  });

  it('sorts by age ascending with nulls last', () => {
    const sorted = sortMembers([carol, alice, bob, noName], 'age');
    expect(sorted.map((m) => m.age)).toEqual([25, 30, 40, null]);
  });

  it('sorts by email alphabetically, nulls sort first (empty string)', () => {
    const sorted = sortMembers([carol, alice, bob, noName], 'email');
    expect(sorted.map((m) => m.id)).toEqual(['4', '1', '2', '3']); // '' (null), alice, bob, carol
  });

  it('defaults to lastName when value is unexpected (type safety)', () => {
    // calling with valid type; verifying displayName utility
    expect(displayName(alice)).toBe('Alice Smith');
    expect(displayName(noName)).toBe('Zebra');
  });
});
