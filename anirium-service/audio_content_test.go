package main

import (
	"context"
	"encoding/binary"
	"math"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestAudioContentBiasCannotHideDifferentWaveform(t *testing.T) {
	makePCM := func(frequency, gain, bias float64) []byte {
		data := make([]byte, 16000)
		for sample := 0; sample < len(data)/2; sample++ {
			value := int16(bias + gain*math.Sin(2*math.Pi*frequency*float64(sample)/8000))
			binary.LittleEndian.PutUint16(data[sample*2:], uint16(value))
		}
		return data
	}
	reference := makePCM(440, 500, 10000)
	if matchingAudioContent(reference, makePCM(880, 500, 10000)) {
		t.Fatal("common DC bias certified unrelated audio")
	}
	if !matchingAudioContent(reference, makePCM(440, 1000, 5000)) {
		t.Fatal("same waveform with mastering gain/bias rejected")
	}
}

func TestAudioContentComparesPartialFinalWindow(t *testing.T) {
	a, b := make([]byte, 1620), make([]byte, 1620)
	for index := 0; index < len(a); index += 2 {
		binary.LittleEndian.PutUint16(a[index:], 1000)
		binary.LittleEndian.PutUint16(b[index:], 1000)
	}
	if !matchingAudioContent(a, b) {
		t.Fatal("identical partial window rejected")
	}
	for index := 1600; index < len(b); index += 2 {
		binary.LittleEndian.PutUint16(b[index:], uint16(64536))
	}
	if matchingAudioContent(a, b) {
		t.Fatal("different trailing content was ignored")
	}
}

func TestAudioContentAcceptsCompressionButRejectsDifferentTrack(t *testing.T) {
	root := t.TempDir()
	makeSignature := func(name, frequency, codec string) []byte {
		path := filepath.Join(root, name+".mkv")
		out, err := exec.Command(mediaTool("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency="+frequency+":duration=2", "-c:a", codec, path).CombinedOutput()
		if err != nil {
			t.Fatalf("fixture: %v %s", err, out)
		}
		data, err := audioContentSignature(context.Background(), path)
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	a := makeSignature("reference", "440", "flac")
	b := makeSignature("compressed", "440", "aac")
	c := makeSignature("different", "880", "flac")
	// AAC may add container padding; compare the common decoded duration.
	n := min(len(a), len(b))
	a, b = a[:n], b[:n]
	if !matchingAudioContent(a, b) {
		t.Fatal("matching compressed audio rejected")
	}
	if matchingAudioContent(a, c[:len(a)]) {
		t.Fatal("different same-language track accepted")
	}
}
