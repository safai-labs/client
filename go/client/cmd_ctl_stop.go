package client

import (
	"fmt"

	"github.com/keybase/cli"
	"github.com/keybase/client/go/libcmdline"
	"github.com/keybase/client/go/libkb"
)

func NewCmdCtlStop(cl *libcmdline.CommandLine) cli.Command {
	return cli.Command{
		Name:        "stop",
		Usage:       "keybase ctl stop",
		Description: "Stop the background keybase service",
		Action: func(c *cli.Context) {
			cl.ChooseCommand(&CmdCtlStop{}, "stop", c)
			cl.SetForkCmd(libcmdline.NoFork)
		},
	}
}

type CmdCtlStop struct{}

func (s *CmdCtlStop) ParseArgv(ctx *cli.Context) error {
	return nil
}

func (s *CmdCtlStop) RunClient() (err error) {
	cli, err := GetCtlClient()
	if err != nil {
		return err
	}
	return cli.Stop()
}

func (s *CmdCtlStop) Run() error {
	return fmt.Errorf("Can't run `ctl stop` in standalone mode")
}

func (s *CmdCtlStop) GetUsage() libkb.Usage {
	return libkb.Usage{}
}
