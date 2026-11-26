using System;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
public static class VelaWindowsAuth {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
  struct UI { public int size; public IntPtr parent; public string message; public string caption; public IntPtr banner; }
  [DllImport("credui.dll",ExactSpelling=true,SetLastError=true)] static extern uint CredUIPromptForWindowsCredentialsW(ref UI ui,uint error,ref uint package,IntPtr input,uint inputSize,out IntPtr output,out uint outputSize,IntPtr save,uint flags);
  [DllImport("credui.dll",ExactSpelling=true,SetLastError=true)] static extern bool CredUnPackAuthenticationBufferW(uint flags,IntPtr auth,uint size,IntPtr user,ref uint users,IntPtr domain,ref uint domains,IntPtr password,ref uint passwords);
  [DllImport("advapi32.dll",ExactSpelling=true,SetLastError=true)] static extern bool LogonUserW(IntPtr user,IntPtr domain,IntPtr password,uint type,uint provider,out IntPtr token);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  static void Clear(IntPtr ptr,int bytes) { if(ptr!=IntPtr.Zero) for(int i=0;i<bytes;i++) Marshal.WriteByte(ptr,i,0); }
  static void Free(IntPtr ptr,int bytes) { if(ptr!=IntPtr.Zero) { Clear(ptr,bytes);Marshal.FreeCoTaskMem(ptr); } }
  [DllImport("combase.dll")] static extern int RoInitialize(uint type);
  [DllImport("combase.dll")] static extern void RoUninitialize();
  [DllImport("combase.dll")] static extern int RoGetActivationFactory(IntPtr name,ref Guid iid,out IntPtr factory);
  [DllImport("combase.dll",CharSet=CharSet.Unicode,ExactSpelling=true)] static extern int WindowsCreateString(string value,int length,out IntPtr handle);
  [DllImport("combase.dll")] static extern int WindowsDeleteString(IntPtr handle);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int RequestConsent(IntPtr self,IntPtr window,IntPtr message,ref Guid iid,out IntPtr operation);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int ReadAsyncValue(IntPtr self,out int result);

  enum Consent { Unavailable, Rejected, Verified }
  static Delegate Method(IntPtr instance,int slot,Type type) {
    return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance),slot*IntPtr.Size),type);
  }
  static Consent VerifyHello(IntPtr parent,string message) {
    int initialized=RoInitialize(1); // Multi-threaded apartment, running on a worker.
    if(initialized<0)return Consent.Unavailable;
    IntPtr name=IntPtr.Zero,text=IntPtr.Zero,factory=IntPtr.Zero,operation=IntPtr.Zero,info=IntPtr.Zero;
    try {
      const string className="Windows.Security.Credentials.UI.UserConsentVerifier";
      Guid interop=new Guid("39e050c3-4e74-441a-8dc0-b81104df949c");
      // WinRT parameterized IID of IAsyncOperation<UserConsentVerificationResult>.
      Guid operationId=new Guid("fd596ffd-2318-558f-9dbe-d21df43764a5");
      if(WindowsCreateString(className,className.Length,out name)<0 ||
         RoGetActivationFactory(name,ref interop,out factory)<0 ||
         WindowsCreateString(message,message.Length,out text)<0)return Consent.Unavailable;
      // IInspectable occupies the first six vtable slots.
      var request=(RequestConsent)Method(factory,6,typeof(RequestConsent));
      if(request(factory,parent,text,ref operationId,out operation)<0||operation==IntPtr.Zero)return Consent.Unavailable;
      Guid asyncInfo=new Guid("00000036-0000-0000-c000-000000000046");
      if(Marshal.QueryInterface(operation,ref asyncInfo,out info)<0)return Consent.Rejected;
      var readStatus=(ReadAsyncValue)Method(info,7,typeof(ReadAsyncValue));
      int status;
      for(int attempt=0;attempt<1100;attempt++){
        if(readStatus(info,out status)<0)return Consent.Rejected;
        if(status==0){Thread.Sleep(100);continue;}
        if(status!=1)return Consent.Rejected;
        var readResult=(ReadAsyncValue)Method(operation,8,typeof(ReadAsyncValue));
        int result;
        if(readResult(operation,out result)<0)return Consent.Rejected;
        if(result==0)return Consent.Verified;
        return result==1||result==2?Consent.Unavailable:Consent.Rejected;
      }
      return Consent.Rejected;
    }finally{
      if(info!=IntPtr.Zero)Marshal.Release(info);
      if(operation!=IntPtr.Zero)Marshal.Release(operation);
      if(factory!=IntPtr.Zero)Marshal.Release(factory);
      if(text!=IntPtr.Zero)WindowsDeleteString(text);
      if(name!=IntPtr.Zero)WindowsDeleteString(name);
      RoUninitialize();
    }
  }
  public static bool Verify(ulong parent,bool english) {
    IntPtr window=new IntPtr(unchecked((long)parent));
    string message=english?"Verify your identity to access saved credentials.":"Conferma la tua identità per accedere alle credenziali salvate.";
    Consent consent=Task.Run(()=>VerifyHello(window,message)).GetAwaiter().GetResult();
    if(consent!=Consent.Unavailable)return consent==Consent.Verified;
    UI ui=new UI();ui.size=Marshal.SizeOf(ui);ui.parent=new IntPtr(unchecked((long)parent));ui.caption="Vela";
    ui.message=english?"Confirm your Windows account password to access saved credentials.":"Conferma la password del tuo account Windows per accedere alle credenziali salvate.";
    uint package=0,size=0;IntPtr output=IntPtr.Zero,user=IntPtr.Zero,domain=IntPtr.Zero,password=IntPtr.Zero,token=IntPtr.Zero;
    const int bytes=8192;
    try {
      // ENUMERATE_CURRENT_USER | SECURE_PROMPT; no saving credentials.
      uint result=CredUIPromptForWindowsCredentialsW(ref ui,0,ref package,IntPtr.Zero,0,out output,out size,IntPtr.Zero,0x200|0x1000);
      if(result!=0||size==0||size>1048576)return false;
      user=Marshal.AllocCoTaskMem(bytes);domain=Marshal.AllocCoTaskMem(bytes);password=Marshal.AllocCoTaskMem(bytes);
      Clear(user,bytes);Clear(domain,bytes);Clear(password,bytes);
      uint u=bytes/2,d=bytes/2,p=bytes/2;
      if(!CredUnPackAuthenticationBufferW(1,output,size,user,ref u,domain,ref d,password,ref p))return false;
      // A blank password does not protect a vault. Passwordless/unsupported
      // providers fail closed rather than accepting an unverified response.
      if(Marshal.ReadInt16(password)==0)return false;
      string account=Marshal.PtrToStringUni(user),authority=Marshal.PtrToStringUni(domain);
      int separator=account.IndexOf('\\');
      if(separator>0) {
        if(String.IsNullOrEmpty(authority))authority=account.Substring(0,separator);
        account=account.Substring(separator+1);
        Marshal.Copy((account+"\0").ToCharArray(),0,user,account.Length+1);
      }
      if(String.IsNullOrEmpty(authority)&&account.IndexOf('@')<0)authority=".";
      if(!String.IsNullOrEmpty(authority))Marshal.Copy((authority+"\0").ToCharArray(),0,domain,authority.Length+1);
      if(!LogonUserW(user,String.IsNullOrEmpty(authority)?IntPtr.Zero:domain,password,2,0,out token))return false;
      using(WindowsIdentity entered=new WindowsIdentity(token))
      using(WindowsIdentity current=WindowsIdentity.GetCurrent()) return entered.User!=null&&entered.User.Equals(current.User);
    } finally { if(token!=IntPtr.Zero)CloseHandle(token);Free(user,bytes);Free(domain,bytes);Free(password,bytes);Free(output,(int)Math.Min(size,1048576)); }
  }
}
public static class Program {
  [System.STAThread]
  public static int Main(string[] args) {
    try {
      ulong hwnd;
      if(args.Length!=2 || !ulong.TryParse(args[0],out hwnd) || (args[1]!="en" && args[1]!="it")) return 1;
      return VelaWindowsAuth.Verify(hwnd,args[1]=="en")?0:1;
    } catch { return 1; }
  }
}
