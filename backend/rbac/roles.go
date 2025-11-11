package rbac

// Role represents a logical capability grouping for authenticated users.
type Role string

const (
	RoleAdmin       Role = "admin"
	RoleStaff       Role = "staff"
	RoleJumpMaster  Role = "jump_master"
	RoleJumpLeader  Role = "jump_leader"
	RoleGroundCrew  Role = "ground_crew"
	RoleDriver      Role = "driver"
	RolePacker      Role = "packer"
	RoleParticipant Role = "participant"
)

// Permission represents an actionable verb within the API surface.
type Permission string

const (
	PermissionViewSeasons           Permission = "seasons:view"
	PermissionManageSeasons         Permission = "seasons:manage"
	PermissionViewEvents            Permission = "events:view"
	PermissionManageEvents          Permission = "events:manage"
	PermissionViewManifests         Permission = "manifests:view"
	PermissionManageManifests       Permission = "manifests:manage"
	PermissionViewParticipants      Permission = "participants:view"
	PermissionManageParticipants    Permission = "participants:manage"
	PermissionViewCrewAssignments   Permission = "crew_assignments:view"
	PermissionManageCrewAssignments Permission = "crew_assignments:manage"
	PermissionViewLogistics         Permission = "logistics:view"
	PermissionManageLogistics       Permission = "logistics:manage"
	PermissionViewSession           Permission = "session:view"
)

// RoleMatrix enumerates which roles satisfy a permission. The list is
// intentionally explicit so that future API surface areas can reason about the
// impact of access changes.
var RoleMatrix = map[Permission][]Role{
	PermissionViewSeasons: {
		RoleAdmin,
		RoleStaff,
		RoleJumpMaster,
		RoleJumpLeader,
		RoleGroundCrew,
		RoleDriver,
		RolePacker,
		RoleParticipant,
	},
	PermissionManageSeasons: {
		RoleAdmin,
		RoleStaff,
	},
	PermissionViewEvents: {
		RoleAdmin,
		RoleStaff,
		RoleJumpMaster,
		RoleJumpLeader,
		RoleGroundCrew,
		RoleDriver,
		RolePacker,
		RoleParticipant,
	},
	PermissionManageEvents: {
		RoleAdmin,
		RoleStaff,
	},
	PermissionViewManifests: {
		RoleAdmin,
		RoleStaff,
		RoleJumpMaster,
		RoleJumpLeader,
		RoleGroundCrew,
		RoleDriver,
		RolePacker,
	},
	PermissionManageManifests: {
		RoleAdmin,
		RoleStaff,
		RoleJumpMaster,
	},
	PermissionViewParticipants: {
		RoleAdmin,
		RoleStaff,
		RoleJumpMaster,
		RoleJumpLeader,
	},
	PermissionManageParticipants: {
		RoleAdmin,
		RoleStaff,
	},
	PermissionViewCrewAssignments: {
		RoleAdmin,
		RoleStaff,
		RoleJumpMaster,
		RoleJumpLeader,
		RoleGroundCrew,
	},
	PermissionManageCrewAssignments: {
		RoleAdmin,
		RoleStaff,
		RoleJumpMaster,
	},
	PermissionViewLogistics: {
		RoleAdmin,
		RoleStaff,
		RoleGroundCrew,
		RoleDriver,
		RolePacker,
	},
	PermissionManageLogistics: {
		RoleAdmin,
		RoleStaff,
		RoleGroundCrew,
	},
	PermissionViewSession: {
		RoleAdmin,
		RoleStaff,
		RoleJumpMaster,
		RoleJumpLeader,
		RoleGroundCrew,
		RoleDriver,
		RolePacker,
		RoleParticipant,
	},
}
