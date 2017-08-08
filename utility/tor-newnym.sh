#!/bin/bash

[ "$#" -eq 2 ] || { echo "usage: $0 <controlport> <password>" >&2; exit 1; }

echo -ne 'AUTHENTICATE "'$2'"\r\nSIGNAL NEWNYM\r\necho QUIT\r\n' | nc localhost $1 > /dev/null
