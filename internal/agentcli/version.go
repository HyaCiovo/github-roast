package agentcli

var (
	Version = "dev"
	Commit  = "none"
	Date    = "unknown"
)

func VersionString() string {
	return "ghfind " + Version + " (" + Commit + ", " + Date + ")"
}
