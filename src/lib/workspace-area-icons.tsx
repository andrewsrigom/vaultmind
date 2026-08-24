import {
  BookOpen,
  BriefcaseBusiness,
  ChartNoAxesColumn,
  Coins,
  Folder,
  HeartHandshake,
  LifeBuoy,
  Megaphone,
  Scale,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wrench,
} from 'lucide-react';

import type { WorkspaceAreaIconName } from '@/db/schema';
import type { LucideIcon, LucideProps } from 'lucide-react';

export type WorkspaceAreaIconOption = {
  icon: LucideIcon;
  label: string;
  value: WorkspaceAreaIconName;
};

export const workspaceAreaIconOptions = [
  {
    icon: Folder,
    label: 'Folder',
    value: 'folder',
  },
  {
    icon: BookOpen,
    label: 'Book',
    value: 'book-open',
  },
  {
    icon: BriefcaseBusiness,
    label: 'Briefcase',
    value: 'briefcase',
  },
  {
    icon: ChartNoAxesColumn,
    label: 'Chart',
    value: 'chart',
  },
  {
    icon: Coins,
    label: 'Finance',
    value: 'coins',
  },
  {
    icon: HeartHandshake,
    label: 'People',
    value: 'heart',
  },
  {
    icon: LifeBuoy,
    label: 'Support',
    value: 'life-buoy',
  },
  {
    icon: Megaphone,
    label: 'Marketing',
    value: 'megaphone',
  },
  {
    icon: Scale,
    label: 'Legal',
    value: 'scale',
  },
  {
    icon: ShieldCheck,
    label: 'Security',
    value: 'shield',
  },
  {
    icon: Sparkles,
    label: 'Priority',
    value: 'sparkles',
  },
  {
    icon: UsersRound,
    label: 'Team',
    value: 'users',
  },
  {
    icon: Wrench,
    label: 'Operations',
    value: 'wrench',
  },
] satisfies WorkspaceAreaIconOption[];

const workspaceAreaIconByName = new Map(
  workspaceAreaIconOptions.map((option) => [option.value, option.icon]),
);

export function getWorkspaceAreaIconComponent(
  icon: WorkspaceAreaIconName | null | undefined,
): LucideIcon {
  return workspaceAreaIconByName.get(icon ?? 'folder') ?? Folder;
}

type WorkspaceAreaIconProps = LucideProps & {
  icon: WorkspaceAreaIconName | null | undefined;
};

export function WorkspaceAreaIcon({ icon, ...props }: WorkspaceAreaIconProps) {
  switch (icon ?? 'folder') {
    case 'book-open':
      return <BookOpen {...props} />;
    case 'briefcase':
      return <BriefcaseBusiness {...props} />;
    case 'chart':
      return <ChartNoAxesColumn {...props} />;
    case 'coins':
      return <Coins {...props} />;
    case 'heart':
      return <HeartHandshake {...props} />;
    case 'life-buoy':
      return <LifeBuoy {...props} />;
    case 'megaphone':
      return <Megaphone {...props} />;
    case 'scale':
      return <Scale {...props} />;
    case 'shield':
      return <ShieldCheck {...props} />;
    case 'sparkles':
      return <Sparkles {...props} />;
    case 'users':
      return <UsersRound {...props} />;
    case 'wrench':
      return <Wrench {...props} />;
    case 'folder':
    default:
      return <Folder {...props} />;
  }
}
