package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

func privateLogDescriptor() (*windows.SECURITY_DESCRIPTOR, error) {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return nil, err
	}
	// No inherited ACEs: modifying this descriptor must not propagate to
	// unowned files. Each managed file receives its own protected DACL.
	return windows.SecurityDescriptorFromString("D:P(A;;FA;;;" + user.User.Sid.String() + ")(A;;FA;;;SY)")
}

func privateLogHandle(path string, access, creation, flags uint32, sd *windows.SECURITY_DESCRIPTOR) (*os.File, error) {
	if sd == nil {
		return nil, errors.New("private log descriptor unavailable")
	}
	acl, _, err := sd.DACL()
	if err != nil || acl == nil {
		return nil, errors.New("private log DACL unavailable")
	}
	name, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	attributes := &windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: sd}
	// No FILE_SHARE_DELETE: the opened object cannot be replaced while its
	// identity, DACL and contents are being checked/written.
	desired := access | windows.READ_CONTROL | windows.WRITE_DAC | windows.FILE_READ_ATTRIBUTES
	if flags&windows.FILE_FLAG_BACKUP_SEMANTICS != 0 {
		// SetSecurityInfo documents MAXIMUM_ALLOWED handles as suppressing
		// child ACL propagation. Unowned files must keep their existing ACLs.
		desired = windows.MAXIMUM_ALLOWED
	}
	handle, err := windows.CreateFile(name, desired,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE, attributes, creation,
		flags|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return nil, err
	}
	ok := false
	defer func() {
		if !ok {
			windows.CloseHandle(handle)
		}
	}()
	var info windows.ByHandleFileInformation
	if err = windows.GetFileInformationByHandle(handle, &info); err != nil {
		return nil, err
	}
	if info.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 || (info.FileAttributes&windows.FILE_ATTRIBUTE_DIRECTORY == 0 && info.NumberOfLinks != 1) {
		return nil, errors.New("linked managed log object rejected")
	}
	buffer := make([]uint16, 32768)
	size, err := windows.GetFinalPathNameByHandle(handle, &buffer[0], uint32(len(buffer)), 0)
	if err != nil || size >= uint32(len(buffer)) {
		return nil, errors.New("managed log identity unavailable")
	}
	resolved := windows.UTF16ToString(buffer[:size])
	if strings.HasPrefix(resolved, `\\?\UNC\`) {
		resolved = `\\` + strings.TrimPrefix(resolved, `\\?\UNC\`)
	} else {
		resolved = strings.TrimPrefix(resolved, `\\?\`)
	}
	if !strings.EqualFold(filepath.Clean(resolved), filepath.Clean(path)) {
		return nil, errors.New("managed log path identity changed")
	}
	if err = windows.SetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION, nil, nil, acl, nil); err != nil {
		return nil, err
	}
	ok = true
	return os.NewFile(uintptr(handle), path), nil
}
