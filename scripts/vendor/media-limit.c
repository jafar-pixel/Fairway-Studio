#define _GNU_SOURCE
#include <sys/resource.h>
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
static void cap(int resource, rlim_t limit) { struct rlimit r={limit,limit}; if(setrlimit(resource,&r)!=0){perror("media resource limit");exit(125);} }
int main(int argc,char **argv) {
 if(argc<2||argv[1][0]!='/'){fputs("Absolute executable required.\n",stderr);return 125;}
 cap(RLIMIT_AS,2147483648ULL);cap(RLIMIT_CPU,155);cap(RLIMIT_FSIZE,100000000);cap(RLIMIT_NOFILE,64);cap(RLIMIT_CORE,0);
 execv(argv[1],argv+1);perror("media executable");return 126;
}
