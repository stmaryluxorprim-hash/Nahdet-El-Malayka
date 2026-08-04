export type UserStatus = 'pending' | 'approved' | 'rejected'
export type Gender = 'male' | 'female'
export type AttendanceStatus = 'present' | 'absent' | 'late'

export interface Role { id: number; key: string; name_ar: string }
export interface Permission { id: number; key: string; name_ar: string }

export interface Profile {
  id: string
  full_name: string
  username: string | null
  phone: string | null
  role_id: number | null
  status: UserStatus
  avatar_url: string | null
  created_at: string
  roles?: Role | null
}

export interface ClassRow { id: string; name: string; description: string | null; sort_order: number }

export interface Child {
  id: string
  code: string
  name: string
  phone: string
  gender: Gender
  class_id: string | null
  photo_url: string | null
  birthday: string | null
  notes: string | null
  total_points: number
  is_active: boolean
  created_at: string
  classes?: ClassRow | null
}

export interface AttendanceRow {
  id: string
  child_id: string
  date: string
  status: AttendanceStatus
  recorded_by: string | null
}

export interface UserPermission {
  id: number
  user_id: string
  permission_id: number
  granted_by: string | null
  permissions?: Permission | null
}

export interface DayTask {
  id: string
  name: string
  icon: string
  description: string | null
  sort_order: number
  created_at: string
}

export interface DayAssignment {
  id: string
  date: string
  task_id: string
  user_id: string
  notes: string | null
  created_by: string | null
  created_at: string
  profiles?: Pick<Profile, 'id' | 'full_name' | 'phone' | 'avatar_url'> | null
  day_tasks?: DayTask | null
}

export interface PointTx {
  id: string
  child_id: string
  points: number
  reason: string | null
  category: string
  date: string
  created_at: string
}
